// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

// Requirements
var fs               = require( "fs" );
var async            = require( "async" );
var marked           = require( "marked" );
var open             = require( "open" );
var config           = require( "./config.json" );
var itemTypes        = require( "./itemTypes.json" );
var Item             = require( "./item.js" );
var Misc             = require( "./misc.js" );
var Filter           = require( "./filter.js" );
var Filters          = require( "./filters.js" );
var Currency         = require( "./currency.js" );
var Chunk            = require( "./chunk.js" );

// Current leagues
var leagues         = config.leagues;
var filters         = new Filters([]);

var mu              = require( 'mu2' );
mu.root             = __dirname + '/templates';
const notifier      = require('node-notifier');
notifier.on( "timeout", function () {
    // displayingNotification = false;
});

notifier.on( "click", function () {
    // displayingNotification = false;
    Misc.formatMessage( lastItem, function( str ) {
        ncp.copy( str, function() {
            notifier.notify({
                'title': 'Message copied to clipboard',
                'message': str,
            });
        });
    });
});

var ncp             = require( "copy-paste" );
var editingFilter   = "";    // Are we editing filters at the moment
var downloading     = false; // Is the tool downloading chunks at the moment
var results         = {};
var resultsId       = [];
var entryLookup     = {};
var itemInStash     = {};
// Price regexp
var priceReg        = /(?:([0-9\.]+)|([0-9]+)\/([0-9]+)) ([a-z]+)/g;
var currencyRates   = {};
var delayQueue      = []; // Stores filtered items
var displayingNotification = false;
var lastItem        = null;

// var writeFilterStats = function( filterStats ) {
//     fs.appendFile( __dirname + "/stats_filters.csv", filterStats, function( err ) {
//         if ( err ) {
//             return console.log( err );
//         }
//         console.log( "The file was saved!" );
//     });
// };

$( document).ready( function() {

    // Interface - actions binding
    // ------------------------------------------------------------------------
    // Cancel editing when 'Cancel filter' is clicked
    $( "#cancel-filter" ).click( function() {
        cancelEditAction();
    });

    // When clicking on 'Add filter', add filter
    $( "#add-filter" ).click( function() {
        addFilterAction();
    });

    // When typing in the filter filter input text field
    $( "#filter-filter" ).keyup( function() {
        filterFilterListAction();
    });

    // When typing in the item filter input text field
    $( "#item-filter" ).keyup( function() {
        filterResultListAction();
    });

    // Fold/unfold filter list when clicking on the arrow
    $( "#fold-filters" ).click( function() {
        foldFilters();
    });

    // Actions
    // ------------------------------------------------------------------------

    // Fold/unfold filter list action
    var foldFilters = function() {
        $( "#fold-filters" ).toggleClass( "folded" );
        if ( $( "#fold-filters" ).hasClass( "folded" )) {
            $( "#filters" ).slideUp();
        } else {
            $( "#filters" ).slideDown();
        }
    };

    // View setup when dismissing a new update
    var dismissUpdate = function() {
        // Unblur everything
        $( ".filter-form" ).removeClass( "blurred" );
        $( ".filter-interaction" ).removeClass( "blurred" );
        $( ".filter-list" ).removeClass( "blurred" );
        $( ".filter-results" ).removeClass( "blurred" );
        $( ".progress" ).removeClass( "blurred" );
        $( ".cover" ).fadeOut();
        $( ".new-update" ).fadeOut( "fast" );
    };

    // Action when the download button is pressed
    var downloadUpdate = function( version ) {
        open( "https://github.com/licoffe/POE-sniper/releases/" + version );
    };

    // Animate scroll to the top of the page
    var scrollToTopAction = function() {
        // scroll body to 0px on click
        $('body,html').animate({
            scrollTop: 0
        }, config.SCROLL_BACK_TOP_SPEED );
        return false;
    };

    // Action when the user is typing in the filter items text field
    var filterResultListAction = function() {
        var text = $( "#item-filter" ).val().toLowerCase();
        $( ".results .collection-item" ).each( function() {
            if ( text === "" ) {
                $( this ).show();
            } else {
                var itemName = $( this ).find( ".item" ).text();
                if ( itemName.toLowerCase().indexOf( text ) === -1 ) {
                    $( this ).hide();
                }
            }
        });
    };

    // Action when the user is typing in the filter filters text field
    var filterFilterListAction = function() {
        var text = $( "#filter-filter" ).val().toLowerCase();
        $( "#filters .collection-item" ).each( function() {
            if ( text === "" ) {
                $( this ).show();
            } else {
                var itemName = $( this ).find( ".item" ).text();
                if ( itemName.toLowerCase().indexOf( text ) === -1 ) {
                    $( this ).hide();
                }
            }
        });
        $( "#filters-amount" ).text( $( "#filters .collection-item:visible" ).length );
    };

    // When clicking on 'Clear Filter'
    var cancelEditAction = function() {
        $( "#league" ).val( config.leagues[config.defaultLeagueIndex]);
        $( "#league").material_select();
        $( "#item" ).val( "" );
        $( "#price" ).val( "" );
        $( "#currency" ).val( "chaos" );
        $( "#currency").material_select();
        $( "#links" ).val( "any" );
        $( "#links").material_select();
        $( "#sockets-total" ).val( "" );
        $( "#sockets-red" ).val( "" );
        $( "#sockets-green" ).val( "" );
        $( "#sockets-blue" ).val( "" );
        $( "#sockets-white" ).val( "" );
        $( "#corrupted" ).val( "any" );
        $( "#corrupted").material_select();
        $( "#crafted" ).val( "any" );
        $( "#crafted").material_select();
        $( "#enchanted" ).val( "any" );
        $( "#enchanted").material_select();
        $( "#identified" ).val( "any" );
        $( "#identified").material_select();
        $( "#level" ).val( "" );
        $( "#tier" ).val( "" );
        $( "#experience" ).val( "" );
        $( "#quality" ).val( "" );
        $( "#rarity" ).val( "any" );
        $( "#rarity").material_select();
        $( "#armor" ).val( "" );
        $( "#es" ).val( "" );
        $( "#evasion" ).val( "" );
        $( "#dps" ).val( "" );
        $( "#pdps" ).val( "" );
        $( "#price-bo" ).prop( "checked", true );
        $( "#clipboard" ).prop( "checked", false );
        $( "#affixes-list" ).empty();
        $( "#item-type" ).val( "any" );
        $( "#item-type").material_select();

        // If we are editing and the button is 'Clear Filter'
        if ( $( this ).text() !== "Clear filter" ) {
            $( "#add-filter" ).text( "Add filter" );
            $( "#cancel-filter" ).text( "Clear filter" );
            $( "#cancel-filter" ).removeClass( "red" ).addClass( "blue-grey" );
            editingFilter = "";
        }
    };

    // When adding a new filter
    var addFilterAction = function() {
        // console.log( "Adding filter" );
        fetchFormData( function( formData ) {
            // console.log( formData );
            // var re         = /([0-9.]+)/g;
            $( ".affix-item" ).each( function() {
                data = $( this ).data( "data-item" );
                formData.affixes[data.title] = [data.min, data.max];
                var count = ( data.title.match( /#/g ) || []).length;
                // console.log( data.title );
                // console.log( count );
                var affix = "";
                if ( count > 1 ) {
                    affix = data.title.replace( "#", data.min );
                    affix = affix.replace( "#", data.max );
                } else {
                    affix = data.title.replace( "#", "( " + data.min + " - " + data.max + " )" );
                }
                formData.affixesDis.push( affix );
            });
            // console.log( formData.affixes );
            // console.log( formData.league );
            // console.log( currencyRates );
            if ( formData.budget > currencyRates[formData.league].exa && currency === "chaos" ) {
                formData.budget /= currencyRates[formData.league].exa;
                currency = "exa";
            }
            formData.budget = Math.round( formData.budget * 100 ) / 100;
            var title = "";
            if ( formData.corrupted === "true" ) {
                title += "<span class=\"filter-corrupted\">Corrupted</span>";
            }
            if ( formData.enchanted === "true" ) {
                title += "<span class=\"filter-enchanted\">Enchanted</span>";
            }
            if ( formData.crafted === "true" ) {
                title += "<span class=\"filter-crafted\">Crafted</span>";
            }
            if ( formData.itemType !== "any" ) {
                title += "<span style=\"padding-right: 10px;\">" + formData.item + "(any " + formData.itemType + ")</span>";
            } else {
                title += "<span style=\"padding-right: 10px;\">" + formData.item + "</span>";
            }
            if ( formData.links !== "0" && formData.links !== "any" ) {
                title += "<span class=\"filter-links\">" + formData.links + "L</span>";
            }
            var total;
            if ( formData.socketsTotal === "" ) {
                total = 0;
            } else {
                total = formData.socketsTotal;
            }
            var string       = "";
            var detailSocket = "";
            if ( formData.socketsRed !== "" && formData.socketsRed !== 0 ) {
                if ( formData.socketsTotal === "" ) {
                    total  += parseInt( formData.socketsRed );
                }
                detailSocket += formData.socketsRed + "R ";
            }
            if ( formData.socketsGreen !== "" && formData.socketsGreen !== 0 ) {
                if ( formData.socketsTotal === "" ) {
                    total  += parseInt( formData.socketsGreen );
                }
                detailSocket += formData.socketsGreen + "G ";
            }
            if ( formData.socketsBlue !== "" && formData.socketsBlue !== 0 ) {
                if ( formData.socketsTotal === "" ) {
                    total  += parseInt( formData.socketsBlue );
                }
                detailSocket += formData.socketsBlue + "B ";
            }
            if ( formData.socketsWhite !== "" && formData.socketsWhite !== 0 ) {
                if ( formData.socketsTotal === "" ) {
                    total  += parseInt( formData.socketsWhite );
                }
                detailSocket += formData.socketsWhite + "W ";
            }
            if ( detailSocket !== "" ) {
                string = total + "S ( " + detailSocket + ")";
            } else {
                string = total + "S";
            }
            if ( total > 0 ) {
                title += "<span class=\"filter-sockets\">" + string + "</span>";
            }

            if ( formData.armor !== "" ) {
                title += "<span class=\"filter-property\">Armor>=" + formData.armor + "</span>";
            }
            if ( formData.es !== "" ) {
                title += "<span class=\"filter-property\">ES>=" + formData.es + "</span>";
            }
            if ( formData.evasion !== "" ) {
                title += "<span class=\"filter-property\">Evasion>=" + formData.evasion + "</span>";
            }
            if ( formData.dps !== "" ) {
                title += "<span class=\"filter-property\">DPS>=" + formData.dps + "</span>";
            }
            if ( formData.pdps !== "" ) {
                title += "<span class=\"filter-property\">PDPS>=" + formData.pdps + "</span>";
            }
            if ( formData.quality !== "" ) {
                title += "<span class=\"filter-property\">quality>=" + formData.quality + "%</span>";
            }
            if ( formData.level !== "" ) {
                title += "<span class=\"filter-property\">level>=" + formData.level + "</span>";
            }
            if ( formData.tier !== "" ) {
                title += "<span class=\"filter-property\">Tier>=" + formData.tier + "</span>";
            }
            if ( formData.experience !== "" ) {
                title += "<span class=\"filter-property\">Experience>=" + formData.experience + "%</span>";
            }
            if ( formData.affixesDis.length > 0 ) {
                title += "<span class=\"filter-affix\">" + formData.affixesDis.join( ", " ) + "</span>";
            }

            var filterId = editingFilter !== "" ? editingFilter : Misc.guidGenerator();
            formData.id = filterId;

            formData.title  = title;
            formData.active = true;
            var filter = new Filter( formData );
            // console.log( filter );
            if ( $( "#add-filter" ).text() === "Add filter" ) {
                // console.log( filters );
                filters.add( filter );
                filters.findFilterIndex( filter, function( res ) {
                    filters.save();
                    filter.render( function( generated ) {
                        postRender( filter, generated , res.index );
                    });
                });
            } else {
                filters.update( filter, function() {
                    filter.render( function( generated ) {
                        filters.findFilterIndex( filter, function( res ) {
                            console.log( res );
                            postRender( filter, generated, res.index );
                        });
                    });
                });
                filters.save();
            }
        });
    };

    // Helpers

    /**
     * Setup autocompletion for both name and affixes
     *
     * @params Nothing
     * @return Nothing
     */
    var setupAutocomplete = function() {
        // Setup name completion
        var data = require( "./autocomplete.json" );
        var autocompleteContent = {};
        async.each( data, function( entry, cb ) {
            if ( entry.name === '' ) {
                autocompleteContent[entry.typeLine] = entry.icon;
            } else {
                autocompleteContent[entry.name] = entry.icon;
            }
            cb();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            $( '#item' ).autocomplete({
                data: autocompleteContent,
                limit: 20
            });
            // Close on Escape
            $( '#item' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });

            // Setup affix completion
            var affixCompletion = require( "./affix-completion.json" );
            // console.log( affixCompletion );
            $( '#affixes' ).autocomplete({
                data: affixCompletion,
                limit: 20
            });
            // Close on Escape
            $( '#affixes' ).keydown( function( e ) {
                if ( e.which == 27 ) {
                    $( ".autocomplete-content" ).empty();
                }
            });
        });
    };

    /**
     * Fetch information from filled form data
     *
     * @params callback
     * @return return collected data through callback
     */
    var fetchFormData = function( callback ) {
        var data          = {};
        data.league       = $( "#league" ).val();
        data.item         = $( "#item" ).val();
        data.budget       = $( "#price" ).val();
        data.currency     = $( "#currency" ).val();
        data.links        = $( "#links" ).val();
        data.socketsTotal = $( "#sockets-total" ).val();
        data.socketsRed   = $( "#sockets-red" ).val();
        data.socketsGreen = $( "#sockets-green" ).val();
        data.socketsBlue  = $( "#sockets-blue" ).val();
        data.socketsWhite = $( "#sockets-white" ).val();
        data.corrupted    = $( "#corrupted" ).val();
        data.crafted      = $( "#crafted" ).val();
        data.enchanted    = $( "#enchanted" ).val();
        data.identified   = $( "#identified" ).val();
        data.level        = $( "#level" ).val();
        data.tier         = $( "#tier" ).val();
        data.experience   = $( "#experience" ).val();
        data.quality      = $( "#quality" ).val();
        data.rarity       = $( "#rarity" ).val();
        data.armor        = $( "#armor" ).val();
        data.es           = $( "#es" ).val();
        data.evasion      = $( "#evasion" ).val();
        data.dps          = $( "#dps" ).val();
        data.pdps         = $( "#pdps" ).val();
        data.buyout       = $( "#price-bo" ).is(":checked");
        data.clipboard    = $( "#clipboard" ).is(":checked");
        data.itemType     = $( "#item-type" ).val();
        data.affixesDis   = [];
        data.affixes      = {};
        callback( data );
    };

    /**
     * Color item name depending on rarity
     *
     * @params filter
     * @return nothing
     */
    var colorRarity = function( filter ) {
        if ( filter.rarity === "1" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "magic" );
        } else if ( filter.rarity === "2" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "rare" );
        } else if ( filter.rarity === "3" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "unique" );
        } else if ( filter.rarity === "4" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "gem" );
        } else if ( filter.rarity === "5" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "currency" );
        } else if ( filter.rarity === "6" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "divination" );
        } else if ( filter.rarity === "8" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "prophecy" );
        } else if ( filter.rarity === "9" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "legacy" );
        } else if ( filter.rarity === "not-unique" ) {
            $( "#" + filter.id ).parent().parent().find( ".item" ).addClass( "not-unique" );
        }
    };

    var updateFilterAmount = function( id ) {
        // $( "#filters-amount" ).text( filters.length );
        $( "#filters-amount" ).text( $( "#filters .collection-item:visible" ).length );
        bindRemoveFilter( id );
    };

    // When clicking on the minus sign, remove filter
    var bindRemoveFilter = function( id ) {
        $( "#" + id + ".remove-filter" ).click( function() {
            // Remove this entry
            $( this ).parent().parent().parent().parent().remove();
            var newFilters = [];
            var id         = $( this ).attr( "id" );
            // console.log( id );
            // Search for filter index and remove it from the array
            async.each( filters.filterList, function( filter, cb ) {
                if ( filter.id !== id ) {
                    newFilters.push( filter );
                }
                cb();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                filters = new Filters( newFilters );
                // console.log( filters );
                updateFilterAmount( id );
                filters.save();
            });
        });
    };

    // Load filters
    var loadFilters = function() {
        // Load filters file in memory
        filterData = require( __dirname + "/filters.json" );
        // For each filter, generate using the 'filter' template
        // and add them to the filters array
        async.each( filterData, function( filter, cbFilter ) {
            filter = new Filter( filter );
            filters.add( filter );
            cbFilter();
        }, function( err ) {
            if ( err ) {
                console.log( err );
            }
            async.each( filters.filterList, function( filter, cbSorted ) {
                filter.render( function( generated ) {
                    $( "#filters ul" ).append( generated );
                    // Color item name depending on rarity
                    colorRarity( filter );
                    if ( filter.buyout ) {
                        $( "#" + filter.id ).parent().parent().find( ".buyout" ).hide();
                    }
                    if ( !filter.clipboard ) {
                        $( "#" + filter.id ).parent().parent().find( ".clipboard" ).hide();
                    }
                    colorFilter( filter );
                    bindFilterToggleState( filter.id );
                    bindFilterEdit( filter.id );
                    updateFilterAmount( filter.id );
                    cbSorted();
                });
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                poeTradeStats( filters );
            });
        });
    };

    /**
     * Color filter based on item name to help visually differenciate
     *
     * @params Filter
     * @return Nothing
     */
    var colorFilter = function( filter ) {
        if ( itemTypes["divination-card"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "divination" );
        } else if ( itemTypes["prophecy"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "prophecy" );
        } else if ( itemTypes["unique"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "unique" );
        } else if ( itemTypes["currency"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "currency" );
        } else if ( itemTypes["gem"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "gem" );
        } else if ( itemTypes["map"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "map" );
        } else if ( itemTypes["fragment"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "fragment" );
        } else if ( itemTypes["essence"].types.indexOf( filter.item ) !== -1 ) {
            $( "#filter-detail-" + filter.id + " .item" ).addClass( "essence" );
        } 
    };

    /**
     * View update after creating a new filter
     *
     * @params Filter object, generated HTML code and position
     * @return Nothing
     */
    var postRender = function( filter, generated, position ) {
        var last = false;
        // If new item, is the last in the list
        if (( $( "#filters ul li" ).length > 0 && position + 1 > $( "#filters ul li" ).length - 1 ) || ( position + 1 > $( "#filters ul li" ).length )) {
            last = true;
            // console.log( "Last in list" );
        }
        if ( $( "#add-filter" ).text() === "Add filter" ) {
            if ( last ) {
                $( "#filters ul" ).append( generated );
            } else {
                $( generated ).insertBefore( $( "#filters ul li" )[position] );
            }
        } else {
            $( "#filters ul li" ).has( "#" + editingFilter ).remove();
            if ( last ) {
                $( "#filters ul" ).append( generated );
            } else {
                $( generated ).insertBefore( $( "#filters ul li" )[position] );
            }
            editingFilter = "";
            $( "#add-filter" ).text( "Add filter" );
            $( "#cancel-filter" ).text( "Clear filter" );
            $( "#cancel-filter" ).removeClass( "red" ).addClass( "blue-grey" );
        }
        // Color item name depending on rarity
        colorRarity( filter );
        // console.log( filter.buyout );
        if ( filter.buyout ) {
            $( "#" + filter.id ).parent().parent().find( ".buyout" ).hide();
        }
        if ( !filter.clipboard ) {
            $( "#" + filter.id ).parent().parent().find( ".clipboard" ).hide();
        }
        colorFilter( filter );
        bindFilterToggleState( filter.id );
        bindFilterEdit( filter.id );
        updateFilterAmount( filter.id );
        poeTradeStats( filters );
    };

    var render = function( filter ) {
        var generated = "";
        mu.compileAndRender( "filter.html", filter )
        .on( "data", function ( data ) {
            generated += data.toString();
        })
        .on( "end", function () {
            
        });
        filters.save();
    };

    var bindFilterToggleState = function( id ) {
        $( "#enable-filter-" + id ).click( function() {
            filters.toggle( id );
            filters.save();
        });
    };

    var bindFilterEdit = function( id ) {
        $( ".filter-detail#filter-detail-" + id ).click( function() {
            scrollToTopAction(); // Scroll back to top
            editingFilter = id;
            // Search for filter with the corresponding id
            async.each( filters.filterList, function( filter, cbFilter ) {
                // if filter matches, load all filter informations in the fields
                if ( filter.id === id ) {
                    $( "#league" ).val( filter.league );
                    $( "#league").material_select();
                    $( "#item" ).val( filter.item );
                    $( "#price" ).val( filter.budget );
                    $( "#currency" ).val( filter.currency );
                    $( "#currency").material_select();
                    $( "#links" ).val( filter.links );
                    $( "#links").material_select();
                    $( "#sockets-total" ).val( filter.socketsTotal );
                    $( "#sockets-red" ).val( filter.socketsRed );
                    $( "#sockets-green" ).val( filter.socketsGreen );
                    $( "#sockets-blue" ).val( filter.socketsBlue );
                    $( "#sockets-white" ).val( filter.socketsWhite );
                    $( "#corrupted" ).val( filter.corrupted );
                    $( "#corrupted").material_select();
                    $( "#crafted" ).val( filter.crafted );
                    $( "#crafted").material_select();
                    $( "#enchanted" ).val( filter.enchanted );
                    $( "#enchanted").material_select();
                    $( "#identified" ).val( filter.identified );
                    $( "#identified").material_select();
                    $( "#level" ).val( filter.level );
                    $( "#tier" ).val( filter.tier );
                    $( "#experience" ).val( filter.experience );
                    $( "#quality" ).val( filter.quality );
                    $( "#rarity" ).val( filter.rarity );
                    $( "#rarity").material_select();
                    $( "#armor" ).val( filter.armor );
                    $( "#es" ).val( filter.es );
                    $( "#evasion" ).val( filter.evasion );
                    $( "#dps" ).val( filter.dps );
                    $( "#pdps" ).val( filter.pdps );
                    $( "#price-bo" ).prop( "checked", filter.buyout );
                    $( "#clipboard" ).prop( "checked", filter.clipboard );
                    $( "#add-filter" ).text( "Update filter" );
                    $( "#cancel-filter" ).text( "Cancel edit" );
                    $( "#cancel-filter" ).addClass( "red" ).removeClass( "blue-grey" );
                    $( "#item-type" ).val( filter.itemType );
                    $( "#item-type" ).material_select();
                    $( "#affixes-list" ).empty();
                    // For each affix
                    async.each( filter.affixesDis, function( affix, cbAffix ) {
                        var generated = "";
                        // Extract title, min and max
                        var reg = /([0-9\.]+)/g;
                        var match = reg.exec( affix );
                        var matches = [];
                        while ( match !== null ) {
                            matches.push( parseFloat( match[1]));
                            match = reg.exec( affix );
                        }
                        var title = affix.replace( reg, "#" );
                        var obj = {
                            title: title,
                            min:   matches[0],
                            max:   matches[1],
                            affix: affix,
                            id:    Misc.guidGenerator()
                        };
                        mu.compileAndRender( "affix.html", obj )
                        .on( "data", function ( data ) {
                            generated += data.toString();
                        })
                        .on( "end", function () {
                            $( "#affixes-list" ).append( generated );
                            $( "#" + obj.id ).data( "data-item", obj );
                            // When clicking on remove affix
                            $( ".remove-affix" ).click( function() {
                                $( this ).parent().parent().remove();
                            });
                        });
                        cbAffix();
                    });
                }
                cbFilter();
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
            });
        });
    };

    var poeTradeStats = function( filters ) {
        console.log( "Refreshing poe.trade stats" );
        Misc.publishStatusMessage( "Fetching item stats from poe.trade" );
        async.each( filters.filterList, function( filter, cbFilter ) {
            var str = "";
            $.post( "http://poe.trade/search", { name: filter.item, league: filter.league, online: "x", has_buyout: "1" }, function( data ) {
                var wrapper = document.getElementById( "poe-trade-output" );
                wrapper.innerHTML = data;
                // $( "div.poe-trade-output" ).html( data );
                $( "#poe-trade-output script" ).remove();
                $( "#poe-trade-output link" ).remove();
                var prices = [];
                var priceCount = {};
                var mostPopularCount = 0;
                var mostPopularPrice = "";
                var sellers = [];
                $( "#poe-trade-output .item" ).each( function() {
                    var seller = $( this ).data( "seller" );
                    if ( sellers.indexOf( seller ) === -1 ) {
                        // console.log( $( this ).data( "buyout" ));
                        sellers.push( seller );
                        prices.push( $( this ).data( "buyout" ));
                        if ( !priceCount[$( this ).data( "buyout" )]) {
                            priceCount[$( this ).data( "buyout" )] = 0;
                        }
                        priceCount[$( this ).data( "buyout" )]++;
                        if ( priceCount[$( this ).data( "buyout" )] > mostPopularCount ) {
                            mostPopularPrice = $( this ).data( "buyout" );
                            mostPopularCount = priceCount[$( this ).data( "buyout" )];
                        }
                    }
                });
                str += "<span>Poe.trade stats based on <b>" + prices.length + "</b> items</span>";
                for ( var p in priceCount ) {
                    if ( priceCount.hasOwnProperty( p ) && priceCount[p] > 1 ) {
                        str += "<span>" + p + ": <b>" + priceCount[p] + "</b></span>";
                    }
                }
                $( "#" + filter.id ).parent().parent().find( ".item-stats" ).html(
                    str
                );
                // console.log( "Stats over " + prices.length + " items" );
                // console.log( "Most popular price: " + mostPopularPrice + " with " + mostPopularCount );
                // console.log( "Median price: " + prices[parseInt( prices.length/2)]);
                cbFilter();
            });
        });
    };

    loadFilters();
    
    setInterval( poeTradeStats, config.POE_TRADE_STATS_INTERVAL, filters );

    // When clicking on 'Snipe', download change_ids and filter them
    $( "#snipe" ).click( function() {
        if ( !downloading ) {
            downloading = true;
            interrupt   = false;
            $( ".progress" ).fadeIn();
            $( "#snipe" ).text( "Stop" );
            Chunk.getLastChangeId( function( entry ) {
                downloadChunk( entry, downloadChunk );
            });
        } else {
            downloading = false;
            interrupt   = true;
            $( ".progress" ).fadeOut();
            $( "#snipe" ).text( "Snipe" );
        }
    });

    var updateResultsAmount = function() {
        $( "#results-amount" ).text( Object.keys( results ).length );
    };

    // When clicking on share entries icon
    // $( "#share-entries" ).click( function() {
    //     fs.writeFile( __dirname + "/export.json", JSON.stringify( results ), function( err ) {
    //         if ( err ) {
    //             console.log( err );
    //         }
    //     });
    // });

    // When clicking on clear entries icon
    $( "#clear-entries" ).click( function() {
        $( "#results ul" ).empty();
        results   = {};
        resultsId = [];
        updateResultsAmount();
    });

    // When clicking on an entry result, copy a whisper message to clipboard
    var bindClickEntry = function( id ) {
        $( "#" + id ).click( function() {
            var data = $( this ).data( "item" );
            // var str = "@" + data.accountName + " Hi " + data.accountName + ", I would like to buy your '" + data.name + "' in " + data.league + " for " + data.price + " in stash '" + data.stashName + "'. Is it still available? :)";
            Misc.formatMessage( data, function( str ) {
                ncp.copy( str, function() {
                    console.log( data );
                    notifier.notify({
                        'title': 'Message copied to clipboard',
                        'message': str,
                    });
                });
            });
        });
    };
    
    // When clicking on 'add affix'
    $( "#add-affix" ).click( function() {
        var affix = $( "#affixes" ).val();
        if ( affix !== "" ) {
            var min = $( "#affix-min" ).val();
            var max = $( "#affix-max" ).val();
            var count = ( affix.match( /#/g ) || []).length;
            if ( count > 1 ) {
                affix = affix.replace( "#", min );
                affix = affix.replace( "#", max );
            } else {
                affix = affix.replace( "#", "( " + min + " - " + max + " )" );
            }
            var obj = { 
                title: $( "#affixes" ).val(),
                affix: affix,
                min:   min,
                max:   max,
                id:    Misc.guidGenerator()
            };
            var generated = "";
            mu.compileAndRender( "affix.html", obj )
            .on( "data", function ( data ) {
                generated += data.toString();
            })
            .on( "end", function () {
                $( "#affixes-list" ).append( generated );
                $( "#" + obj.id ).data( "data-item", obj );
                // When clicking on remove affix
                $( ".remove-affix" ).click( function() {
                    $( this ).parent().parent().remove();
                });
            });
        }
    });

    /**
     * Send notification and format message
     *
     * @params Item
     * @return Nothing
     */
    var notifyNewItem = function( item ) {
        displayingNotification = true;
        var audio = new Audio( __dirname + '/' + config.sound );
        audio.volume = config.volume;
        audio.play();
        var displayName = item.name;
        var itemType = item.typeLine.replace( "<<set:MS>><<set:M>><<set:S>>", "" );
        if ( itemType !== item.name && ( item.frameType > 0 && item.frameType < 4 )) {
            displayName += " (" + item.typeLine + ")";
        }
        notifier.notify({
            title:   displayName,
            message: "Price: " + item.displayPrice,
            wait:    true
        }, function ( err ) {
            if ( err ) {
                console.log( err );
            }
            displayingNotification = false;
        });

        // If copy to clipboard enabled, do it
        if ( item.clipboard || $( "#global-clipboard" ).prop( "checked" )) {
            Misc.formatMessage( item, function( str ) {
                ncp.copy( str, function() {
                });
            });
        }
    };

    var renderSockets = function( item ) {
        var rsc = {
            "D": "./media/socket_dex.png",
            "S": "./media/socket_str.png",
            "I": "./media/socket_int.png",
            "G": "./media/socket_white.png"
        };
        var currentGroup = -1;
        var lastGroup    = -1;
        var socketIndex  = 0;
        async.each( item.sockets, function( socket, cbSocket ) {
            socketIndex++;
            currentGroup = socket.group;
            // Change image ressource associated to socket type and reveal
            $( "li#" + item.id + " .socket" + socketIndex ).attr( "src", rsc[socket.attr]).show();
            // If we are still in the same group, draw a link
            if ( currentGroup === lastGroup && socketIndex > 1 ) {
                $( "li#" + item.id + " .link" + ( socketIndex - 1 )).show();
            }
            lastGroup = socket.group;
        });
    };

    /**
     * Download all public stashes starting with input chunk ID.
     *
     * Download chunk from POE stash API using wget command with compression.
     * Extract downloaded data and check if next chunk is available. If yes,
     * recurse with next chunk ID.
     * @param chunk ID to download
     * @return next chunk ID to download
     */
    var downloadChunk = function( chunkID, callback ) {

        var begin = Date.now();

        $( "#current-change-id" ).text( chunkID );

        var parseData = function( data ) {
            // Store last chunk ID
            console.time( "Total search time" );
            async.each( filters.filterList, function( filter, callbackFilter ) {
                if ( !filter.active ) {
                    callbackFilter();
                } else {
                    // For each stashes in the new data file
                    var totalItems = 0;
                    async.each( data.stashes, function( stash, callbackStash ) {
                        totalItems += stash.items.length;
                        async.each( stash.items, function( item, callbackItem ) {
                            item.stashTab          = stash.stash;
                            item.lastCharacterName = stash.lastCharacterName;
                            item.accountName       = stash.accountName;
                            filter.check( item, currencyRates, function( item ) {
                                if ( item ) {
                                    if ( !itemInStash[stash.id]) {
                                        itemInStash[stash.id] = {
                                            previousItems: [],
                                            items: []
                                        };
                                    }
                                    itemInStash[stash.id].items.push( item.itemId );
                                    // If item has not already been added
                                    var foundIndex = resultsId.indexOf( item.itemId );
                                    if ( foundIndex !== -1 ) {
                                        $( "li#" + entryLookup[item.itemId]).addClass( "old" );
                                    }
                                    entryLookup[item.itemId] = item.id;
                                    results[item.id] = item;
                                    resultsId.push( item.itemId );
                                    var generated = "";
                                    mu.compileAndRender( "entry.html", item )
                                    .on( "data", function ( data ) {
                                        generated += data.toString();
                                    })
                                    .on( "end", function () {
                                        $( "#results ul" ).prepend( generated );
                                        updateResultsAmount();
                                        item.accountName = stash.lastCharacterName;
                                        item.name = item.item;
                                        
                                        item.price = price;
                                        item.stashName = stash.stash;
                                        $( "#" + item.id ).data( "item", item );
                                        // Add proper coloring
                                        if ( item.frameType === 1 ) {
                                            $( "#" + item.id + " .item" ).addClass( "magic" );
                                        } else if ( item.frameType === 2 ) {
                                            $( "#" + item.id + " .item" ).addClass( "rare" );
                                        } else if ( item.frameType === 3 ) {
                                            $( "#" + item.id + " .item" ).addClass( "unique" );
                                        } else if ( item.frameType === 4 ) {
                                            $( "#" + item.id + " .item" ).addClass( "gem" );
                                        } else if ( item.frameType === 5 ) {
                                            $( "#" + item.id + " .item" ).addClass( "currency" );
                                        } else if ( item.frameType === 6 ) {
                                            $( "#" + item.id + " .item" ).addClass( "divination" );
                                        } else if ( item.frameType === 8 ) {
                                            $( "#" + item.id + " .item" ).addClass( "prophecy" );
                                        } else if ( item.frameType === 9 ) {
                                            $( "#" + item.id + " .item" ).addClass( "legacy" );
                                        } 
                                        bindClickEntry( item.id );
                                        $( "#" + item.id + " .implicit-container" ).html( item.implicit );
                                        $( "#" + item.id + " .enchant-container" ).html( item.enchant );
                                        $( "#" + item.id + " .explicit-container" ).html( item.explicit );
                                        $( "#" + item.id + " .crafted-container" ).html( item.crafted );
                                        if ( item.implicit === "" ) {
                                            $( "#" + item.id + " .implicit-container" ).hide();
                                        }
                                        if ( item.enchant === "" ) {
                                            $( "#" + item.id + " .enchant-container" ).hide();
                                        }
                                        if ( item.crafted === "" ) {
                                            $( "#" + item.id + " .crafted-container" ).hide();
                                        }
                                        if ( !item.corrupted ) {
                                            $( "#" + item.id + " .corrupted" ).hide();
                                        }
                                        $( "#" + item.id + " .properties-container" ).html( item.properties );
                                        // Send notification
                                        // notifier.notify('Message');
                                        item.displayPrice = item.originalPrice;
                                        if ( item.displayPrice === "Negociate price" ) {
                                            item.displayPrice = "barter";
                                        }

                                        renderSockets( item );

                                        // Only notify if the item is new in the list
                                        if ( foundIndex === -1 ) {
                                            item.clipboard = filter.clipboard;
                                            lastItem       = item;
                                            // If delay queue is empty an no notification is being displayed, notify now
                                            // Otherwise, put in the queue
                                            if ( delayQueue.length === 0 && !displayingNotification ) {
                                                notifyNewItem( item );
                                            } else {
                                                delayQueue.push( item );
                                            }
                                        }
                                    });
                                    callbackItem();
                                } else {
                                    callbackItem();
                                }
                            });
                        }, function( err ) {
                            if ( err ) {
                                console.log( err );
                            }
                            // Remove sold/displaced items
                            if ( itemInStash[stash.id] ) {
                                async.each( itemInStash[stash.id].previousItems, function( previousItem, cbPreviousItem ) {
                                    if ( itemInStash[stash.id].items.indexOf( previousItem ) === -1 ) {
                                        $( "li#" + entryLookup[previousItem] ).addClass( "sold" );
                                        delete results[entryLookup[previousItem]];
                                    }
                                    cbPreviousItem();
                                }, function( err ) {
                                    itemInStash[stash.id].previousItems = itemInStash[stash.id].items;
                                    itemInStash[stash.id].items = [];
                                    callbackStash();
                                });
                            } else {
                                callbackStash();
                            }
                            
                            // console.log( "Done with item" );
                        });
                    }, function( err ) {
                        if ( err ) {
                            console.log( err );
                        }
                        callbackFilter();
                        // console.log( "Searched among " + totalItems + " items" );
                        // var end = Date.now();
                        // var filterStats = filter.id + "," + (end - begin) + "," + totalItems + "\n";
                        // writeFilterStats( filterStats );
                        // console.timeEnd( "Searching in " + nextChunkId + " for " + filter.item );
                        
                    });
                }
            }, function( err ) {
                if ( err ) {
                    console.log( err );
                }
                console.timeEnd( "Total search time" );
                done( data );
            });
        };

        Chunk.download( chunkID, parseData );

        var done = function( data ) {
            filterResultListAction();
            var nextID = data.next_change_id;
            var end = Date.now();
            var waitInterval = config.CHUNK_DOWNLOAD_INTERVAL - ( end - begin );

            if ( interrupt ) {
                console.log( "Stopped sniper" );
            } else {
                if ( !interrupt ) {
                    setTimeout( callback, waitInterval, nextID, callback );
                    // callback( nextID, callback );
                }
            }
        };
    };

    // View setup
    // ------------------------------------------------------------------------
    $( 'select' ).material_select(); // Generate selects
    setupAutocomplete();             // Setup autocompletion

    // Fetch new rates now and setup to be fetched every 10 seconds
    Currency.getLastRates( function( rates ) {
        currencyRates = rates;
    });
    setInterval( Currency.getLastRates, config.RATES_REFRESH_INTERVAL, function( rates ) {
        currencyRates = rates;
    });

    // If user decided not to show status bar, hide it
    if ( !config.showStatusBar ) {
        $( "#status-bar" ).hide();
    }

    Misc.checkUpdate( function( data ) {
        // If there is an update
        if ( data ) {
            // Blur everything
            $( ".filter-form" ).addClass( "blurred" );
            $( ".filter-interaction" ).addClass( "blurred" );
            $( ".filter-list" ).addClass( "blurred" );
            $( ".filter-results" ).addClass( "blurred" );
            $( ".progress" ).addClass( "blurred" );
            $( ".cover" ).fadeIn();
            // Set update information
            $( ".update-title" ).html( "POE-Sniper - v" + data.version );
            $( ".update-date" ).html( new Date( data.date ).toLocaleString() + " by <b>" + data.author + "</b>"  );
            $( ".update-body" ).html( marked( data.changelog ));
            $( ".new-update" ).fadeIn( "fast" );

            $( "#download-update" ).click( function() {
                downloadUpdate( data.version );
            });

            $( "#dismiss-update" ).click( function() {
                console.log( "test" );
                dismissUpdate();
            });
        }
    });

    // Clean up old items
    setInterval( function() {
        $( ".old" ).each( function() {
            var attr = $( this ).attr( "id" );
            $( this ).slideUp().remove();
        });
        $( "#results-amount" ).text( $( ".entry" ).length );
    }, 5000 );

    // Setup global clipboard
    $( "#global-clipboard" ).prop( "checked", config.globalClipboard );

    // Google analytics keep alive
    setInterval( function() {
        var iframe = document.getElementById( "google-analytics" );
        iframe.src = iframe.src;
    }, 60000 );

    // Pop filtered result queue at given interval
    setInterval( function() {
        var item = delayQueue.shift();
        if ( item ) {
            notifyNewItem( item );
        }
    }, config.NOTIFICATION_QUEUE_INTERVAL );

    // setInterval( function() {
    //     console.log( "editingFilter: " + editingFilter );
    // }, 1000 );

});