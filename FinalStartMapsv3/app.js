// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'cache.json';

// Function to request location permission and zoom if allowed
function requestLocationAndZoom() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            // Get user's current location
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;

            // Initialize the map with the user's location
            map.setView([latitude, longitude], 3); // Set initial zoom level to 10

            // Get the current zoom level
            var currentZoom = map.getZoom();

            // Target zoom level
            var targetZoom = 10; // Adjust the target zoom level here

            // Calculate the difference between current and target zoom levels
            var zoomDiff = targetZoom - currentZoom;

            // Duration for the animation (in milliseconds)
            var duration = 3000; // Adjust the duration here (in milliseconds)

            // Interval time for each step in the animation
            var interval = 20; // Adjust the interval here (in milliseconds)

            // Number of steps in the animation
            var steps = duration / interval;

            // Calculate the zoom increment per step
            var zoomIncrement = zoomDiff / steps;

            // Initialize the counter for the steps
            var stepCount = 0;

            // Define the function to zoom gradually
            function gradualZoom() {
                // Increment the step count
                stepCount++;

                // Calculate the new zoom level for this step
                var newZoom = currentZoom + zoomIncrement * stepCount;

                // Set the new zoom level
                map.setZoom(newZoom);

                // Check if reached the final step
                if (stepCount >= steps) {
                    // Clear the interval
                    clearInterval(zoomInterval);
                }
            }

            // Call the gradualZoom function in intervals
            var zoomInterval = setInterval(gradualZoom, interval);
        }, function (error) {
            // Handle errors when getting user's location
            console.error('Error getting user location:', error);
        });
    } else {
        // If geolocation is not supported by the browser
        console.error('Geolocation is not supported by this browser.');
    }
}

// Call requestLocationAndZoom when the page is loaded
document.addEventListener("DOMContentLoaded", function () {
    requestLocationAndZoom();
});

// Initialize the map
var map = L.map('map').setView([0, 0], 2);

// Add a tile layer (you can use other providers or your own)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define headers and query for fetching data
var token = "8c3d6ebd26053b772c8fdbd2bd73d78e";
var headers = { "Authorization": "Bearer " + token };

async function fetchData(videogameId) {
    try {
        let allTournaments = [];

        // Loop through pages 1 to 5
        for (let page = 1; page <= 5; page++) {
            const response = await fetch('https://api.start.gg/gql/alpha', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    query: `
query TournamentsByVideogame($perPage: Int!, $page: Int!, $videogameId: ID!) {
  tournaments(query: {
    perPage: $perPage
    page: $page
    sortBy: "startAt asc"
    filter: {
      upcoming: true
      videogameIds: [
        $videogameId
      ]
    }
  }) {
    nodes {
      name
      url
      lat
      lng
      isRegistrationOpen
      numAttendees
      startAt
      images {
        type
        url
      }
    }
  }
}
                    `,
                    variables: {
                        "perPage": 300,
                        "page": page,
                        "videogameId": videogameId
                    }
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const json_data = await response.json();
            console.log('Raw API Response:', JSON.stringify(json_data, null, 2)); // New log for debugging
            const tournaments = json_data.data.tournaments.nodes;

            const filteredTournaments = tournaments.filter(tournament => tournament.isRegistrationOpen !== false);

            allTournaments = allTournaments.concat(filteredTournaments);
        }

        return allTournaments;
    } catch (error) {
        console.error(`Error fetching data: ${error.message}`);
        throw error;
    }
}

// Function to display data on the map
async function displayData(gameId) {
    try {
        const { games: videoGames } = await fetchVideoGames(); // Extract the games array
        const groupedTournaments = {};

        // Get the game name from the games array
        const selectedGame = videoGames.find(game => game.id === gameId);
        const gameName = selectedGame ? selectedGame.name : 'Unknown Game';

        const data = await fetchData(gameId);

        // Get current timestamp
        const currentTime = new Date().getTime();

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url, numAttendees, images } = tournament;

            // Check if lat and lng are valid numbers and not null
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                // Calculate time difference in milliseconds
                const timeDifference = startAt * 1000 - currentTime;

                // Determine if the tournament is within the next 14 days
                const withinNext14Days = timeDifference <= 14 * 24 * 60 * 60 * 1000;

                // Group tournaments with the same coordinates
                const key = `${latNum},${lngNum}`;
                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = {
                        tournaments: [],
                        withinNext14Days
                    };
                }

                // Push tournament to appropriate group based on time
                groupedTournaments[key].tournaments.push({
                    name,
                    lat: latNum,
                    lng: lngNum,
                    startAt,
                    url,
                    numAttendees,
                    images
                });
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });

        // If no tournaments found, show a pop-up for 10 seconds
        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("No Tournaments Found")
                .openOn(map);
        
            setTimeout(function () {
                map.closePopup(popup);
            }, 10000); // Close popup after 10 seconds
        }

        // Display markers for each group of tournaments
        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;

            // Calculate the average coordinates for grouping
            let totalLat = 0;
            let totalLng = 0;
            tournaments.forEach(tournament => {
                totalLat += tournament.lat;
                totalLng += tournament.lng;
            });
            const avgLat = totalLat / tournaments.length;
            const avgLng = totalLng / tournaments.length;

            // Determine the icon color based on the tournament category
            let iconColor;
            const numAttendeesGroup = tournaments.reduce((acc, curr) => acc + curr.numAttendees, 0);
            if (tournaments.some(tournament => tournament.name.toLowerCase().includes("tekken ball"))) {
                iconColor = 'ball'; // Use the ball.png icon
            } else if (tournaments.some(tournament => ["evo japan 2024", "evo 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold'; // Master + Gold
            } else if (tournaments.some(tournament => ["paradise game battle 2024", "combo breaker 2024", "battle arena melbourne 2024", "tgu 2024", "punishment 2", "the mixup 2024", "ceo 2024", "atl super tournament 2024", "vsfighting xii", "emirates showdown 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold'; // Master
            } else if (tournaments.some(tournament => ["electric clash 2024", "only the best 2024", "ufa 2024", "3f - fight for the future", "second wind 2024", "thunderstruck 2024", "brussels challenge 2024", "fv major 2024", "clash of the olympians 2024", "dreamhack dallas 2024", "crossover 2024", "cape town showdown 2024", "hado fight festival", "moor1ng"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'grey'; // Challenger
            } else if (numAttendeesGroup > 255) {
                iconColor = 'gold'; // Tournaments with over 255 attendees
            } else if (numAttendeesGroup > 127) {
                iconColor = 'grey'; // Tournaments with over 127 attendees
            } else if (withinNext14Days) {
                if (numAttendeesGroup >= 96) {
                    iconColor = 'black'; // 96 attendees Black
                } else if (numAttendeesGroup >= 64) {
                    iconColor = 'violet'; // 64 attendees Violet
                } else if (numAttendeesGroup >= 48) {
                    iconColor = 'red'; // 48 attendees Red
                } else if (numAttendeesGroup >= 32) {
                    iconColor = 'orange'; // 32 attendees Orange
                } else if (numAttendeesGroup >= 24) {
                    iconColor = 'yellow'; // 24 attendees Yellow
                } else if (numAttendeesGroup >= 16) {
                    iconColor = 'green'; // 16 attendees Green
                } else {
                    iconColor = 'white'; // Under attendees 16 White
                }
            } else {
                iconColor = 'blue'; // Over 2 weeks away Blue
            }

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);

            if (tournaments.length > 1) {
                let popupContent = '<ul>';
                tournaments.forEach(tournament => {
                    const imageUrl = Array.isArray(tournament.images) 
                        ? tournament.images.find(img => img.type.toLowerCase() === 'profile')?.url || 'No Image'
                        : 'No Image';
            
                    const imageElement = imageUrl !== 'No Image' 
                        ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width: 100px; height: 100px; object-fit: cover;">`
                        : '<img src="/path/to/default-image.jpg" alt="No Image Available" style="width: 100px; height: 100px; object-fit: cover;">';
            
                    popupContent += `<li style="display: flex; align-items: center;">
                        ${imageElement}
                        <div style="margin-left: 10px;">
                            <b>${tournament.name}</b>
                            <br>Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()}
                            <br>Attendees: ${tournament.numAttendees}
                            <br><a href="https://start.gg${tournament.url}" target="_blank">Register</a>
                            <br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(tournament.name)} via startmaps.xyz&url=${encodeURIComponent(`https://start.gg${tournament.url}`)}" target="_blank">Tweet</a>
                        </div>
                    </li>`;
                });
                popupContent += '</ul>';
                marker.bindPopup(popupContent);
            } else {
                const { name, startAt, url, numAttendees, images } = tournaments[0];
                const imageUrl = Array.isArray(images) 
                    ? images.find(img => img.type.toLowerCase() === 'profile')?.url || 'No Image'
                    : 'No Image';
            
                const imageElement = imageUrl !== 'No Image' 
                    ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width: 100px; height: 100px; object-fit: cover;">`
                    : '<img src="/path/to/default-image.jpg" alt="No Image Available" style="width: 100px; height: 100px; object-fit: cover;">';
            
                marker.bindPopup(`
                    <div style="display: flex; align-items: center;">
                        ${imageElement}
                        <div style="margin-left: 10px;">
                            <b>${name}</b>
                            <br>Starts at: ${new Date(startAt * 1000).toLocaleString()}UTC
                            <br>Attendees: ${numAttendees}
                            <br><a href="https://start.gg${url}" target="_blank">Register</a>
                            <br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(name)} via startmaps.xyz&url=${encodeURIComponent(`https://start.gg${url}`)}" target="_blank">Tweet</a>
                        </div>
                    </div>
                `);
            }

            // Set marker icon color
            marker.setIcon(L.icon({
                iconUrl: `custom pin/marker-icon-${iconColor}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }));
        });

        // ... (legend control code remains unchanged, moved outside try-catch in your original)

    } catch (error) {
        console.error(`Error displaying data: ${error.message}`);
    }
}

// Fetch video games data for search bar autocomplete
async function fetchVideoGames() {
    try {
        const response = await fetch(smashGGEndpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        // Extract the list of video games from the response
        const videoGames = data.entities.videogame;

        // Transform into an array of game objects
        const gamesArray = videoGames.map(game => ({
            id: game.id,
            name: game.name,
            abbreviation: game.abbreviation || game.name // Fallback to name if no abbreviation
        }));

        // Precompute a lookup map for efficiency
        const gameLookup = new Map();
        gamesArray.forEach(game => {
            gameLookup.set(game.name.toLowerCase(), game); // Map full name to game object
            gameLookup.set(game.abbreviation.toLowerCase(), game); // Map abbreviation to game object
        });

        // Return both the array and the lookup map
        return { games: gamesArray, lookup: gameLookup };
    } catch (error) {
        console.error(`Error fetching video games data: ${error.message}`);
        throw error;
    }
}

async function autocompleteSearch() {
    try {
        const { games: videoGames, lookup: gameLookup } = await fetchVideoGames();
        const input = document.getElementById('game-search');
        const selectedGames = new Set(); // Use a Set to store selected game IDs

        // Initialize Awesomplete autocomplete
        new Awesomplete(input, {
            list: videoGames.map(game => game.name), // Only full names in the dropdown
            autoFirst: true,
            filter: function(text, input) {
                const searchTerm = input.trim().toLowerCase();
                const game = gameLookup.get(text.toLowerCase()); // Get game by full name
                if (!game) return false;
                return game.name.toLowerCase().startsWith(searchTerm) || 
                       game.abbreviation.toLowerCase().startsWith(searchTerm);
            }
        });

        input.addEventListener('awesomplete-selectcomplete', function(event) {
            const selectedGameName = event.text; // Selected full name
            const game = gameLookup.get(selectedGameName.toLowerCase());
            if (game) {
                selectedGames.add(game.id);
                updateSelectedGamesDisplay(videoGames, selectedGames);
                input.value = ''; // Clear input after selection
            }
        });

        // Initialize display with empty set
        updateSelectedGamesDisplay(videoGames, selectedGames);

    } catch (error) {
        console.error('Error in autocompleteSearch:', error);
    }
}

// Define selectedGames globally or within a module scope
let selectedGames = new Set(); // or let selectedGames = []; if using an Array

// Function to clear selected games and refresh the page
function clearSelectedGames() {
    // Refresh the page to reset all state
    location.reload();
}

// Function to update the display of selected games
function updateSelectedGamesDisplay(videoGames, selectedGames) {
    const display = document.getElementById('selected-games-display');

    // Get the count of selected games
    const selectedGamesCount = selectedGames instanceof Set ? selectedGames.size : selectedGames.length;

    // Update the display to show "X Games Selected"
    display.textContent = `${selectedGamesCount} ${selectedGamesCount === 1 ? 'Game' : 'Games'} Selected`;

    // Update the hidden input field with the selected game IDs
    document.getElementById('selected-games').value = Array.from(selectedGames).join(',');
}

// Example function for adding a game (for context)
function addGame(gameID) {
    if (selectedGames instanceof Set) {
        selectedGames.add(gameID); // Add to the Set
    } else {
        console.error('selectedGames is not a Set');
    }

    // Update display after adding a game
    updateSelectedGamesDisplay([], selectedGames);
}

// Function to clear all existing markers and filters from the map
function clearExistingFiltersAndMarkers() {
    // Remove all markers from the map
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Remove the legend container if it exists
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.remove();
    }
}

async function search() {
    const selectedGameIds = document.getElementById('selected-games').value.split(',').filter(id => id.trim() !== '');
    hideLegend();
    document.getElementById('map-loading-spinner').style.display = 'block';
    clearExistingFiltersAndMarkers();
    if (selectedGameIds.length > 0) {
        for (const gameId of selectedGameIds) {
            await displayData(gameId); // Already updated above
        }
    } else {
        const popup = L.popup()
            .setLatLng(map.getCenter())
            .setContent("No Games Selected")
            .openOn(map);
        setTimeout(() => map.closePopup(popup), 5000);
        document.getElementById('game-search').value = '';
        showLegend();
    }
    document.getElementById('map-loading-spinner').style.display = 'none';
}

// Function to hide the legend
function hideLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'none';
    }
}

// Function to show the legend
function showLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'block';
    }
}

// Function to select or deselect all checkboxes
function toggleAllCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('.pin-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
        const iconColor = checkbox.id.replace('checkbox-', '');
        filterMarkers(iconColor, checked);
    });
}

// Add "Select All" and "Deselect All" buttons to the legend
const selectAllButton = document.createElement('button');
selectAllButton.textContent = 'Select All';
selectAllButton.classList.add('legend-button');
selectAllButton.addEventListener('click', function() {
    toggleAllCheckboxes(true);
});

const deselectAllButton = document.createElement('button');
deselectAllButton.textContent = 'Deselect All';
deselectAllButton.classList.add('legend-button');
deselectAllButton.addEventListener('click', function() {
    toggleAllCheckboxes(false);
});

// Add buttons to legend container
const legendContainer = document.querySelector('.legend-container');
if (legendContainer) {
    legendContainer.appendChild(selectAllButton);
    legendContainer.appendChild(deselectAllButton);
}

// Global variable to store all markers
const allMarkers = [];

// Function to toggle filter options visibility
function toggleFilterOptions() {
    const filterOptions = document.getElementById('filter-options');
    filterOptions.style.display = (filterOptions.style.display === 'none' || filterOptions.style.display === '') ? 'block' : 'none';
}

// Function to select all filters
function selectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateFilters();
}

// Function to deselect all filters
function deselectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateFilters();
}

// Function to update filters based on checkbox states
function updateFilters() {
    const filterStates = {
        'marker-icon-gold.png': document.getElementById('filter-gold').checked,
        'marker-icon-grey.png': document.getElementById('filter-grey').checked,
        'marker-icon-black.png': document.getElementById('filter-black').checked,
        'marker-icon-violet.png': document.getElementById('filter-violet').checked,
        'marker-icon-red.png': document.getElementById('filter-red').checked,
        'marker-icon-orange.png': document.getElementById('filter-orange').checked,
        'marker-icon-yellow.png': document.getElementById('filter-yellow').checked,
        'marker-icon-green.png': document.getElementById('filter-green').checked,
        'marker-icon-white.png': document.getElementById('filter-white').checked,
        'marker-icon-blue.png': document.getElementById('filter-blue').checked
    };

    for (const [iconFile, show] of Object.entries(filterStates)) {
        filterByIcon(iconFile, show);
    }
}

// Function to filter markers by icon
function filterByIcon(iconFile, show) {
    allMarkers.forEach(marker => {
        const iconUrl = marker.options.icon.options.iconUrl;
        if (iconUrl.includes(iconFile)) {
            if (show && !map.hasLayer(marker)) {
                map.addLayer(marker);
            } else if (!show && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        }
    });
}

// Event listener for when the DOM content is loaded
document.addEventListener("DOMContentLoaded", function () {
    // Add event listeners to checkboxes
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateFilters);
    });

    // Initialize the filters based on checkbox states
    updateFilters();
});

// Call the function to set up autocomplete
autocompleteSearch();
