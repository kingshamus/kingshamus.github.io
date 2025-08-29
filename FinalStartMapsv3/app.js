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
            map.setView([latitude, longitude], 3); // Set initial zoom level to 3

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

// Initialize the map
var map = L.map('map').setView([0, 0], 2);

// Add a tile layer (you can use other providers or your own)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define headers and query for fetching data
var token = "8c3d6ebd26053b772c8fdbd2bd73d78e";
var headers = { "Authorization": "Bearer " + token };

// Global variable to store all markers
const allMarkers = [];

// Function to fetch and parse the CSV file for featured tournaments
async function loadFeaturedTournaments() {
    try {
        const response = await fetch('FeaturedEvents.csv'); // Replace with your CSV file path
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${response.status}`);
        }
        const csvText = await response.text();

        // Parse CSV using Papa Parse
        const parsedData = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true
        });

        const featuredTournaments = parsedData.data;
        const geocodedTournaments = [];

        // Function to convert DD/MM/YYYY to ISO 8601 format
        function convertToISODate(ddmmyyyy) {
            const [day, month, year] = ddmmyyyy.split('/');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`;
        }

        // Geocode each tournament's location
        for (const tournament of featuredTournaments) {
            const { 'Tournament name': name, 'Start Date/Time': startAt, Location: location, 'Sign up link': url, Games: games } = tournament;

            // Validate required fields
            if (!name || !startAt || !location || !url) {
                console.warn(`Skipping tournament due to missing fields: ${JSON.stringify(tournament)}`);
                continue;
            }

            try {
                // Convert the date format if necessary
                let isoDate;
                if (startAt.includes('/')) {
                    isoDate = convertToISODate(startAt);
                } else {
                    isoDate = startAt; // Assume it's already in ISO format
                }

                const startAtTimestamp = new Date(isoDate).getTime() / 1000;
                if (isNaN(startAtTimestamp)) {
                    console.warn(`Invalid date format for tournament "${name}": ${startAt}`);
                    continue;
                }

                // Geocode the location using Nominatim
                const coords = await geocodeLocation(location);
                if (coords) {
                    geocodedTournaments.push({
                        name,
                        startAt: startAtTimestamp,
                        lat: coords.lat,
                        lng: coords.lng,
                        url,
                        games: games || 'Not specified',
                        numAttendees: null, // No attendee data in CSV
                        images: [{ type: 'profile', url: 'path/to/default-image.jpg' }] // Default image or fetch dynamically if needed
                    });
                }
            } catch (error) {
                console.error(`Error processing tournament "${name}":`, error);
                continue;
            }
        }

        // Display the featured tournaments on the map
        displayFeaturedTournaments(geocodedTournaments);
    } catch (error) {
        console.error('Error loading featured tournaments:', error);
    }
}

// Function to geocode a location using Nominatim
async function geocodeLocation(location) {
    try {
        const response = await fetch(`${nominatimEndpoint}?q=${encodeURIComponent(location)}&format=json&limit=1`, {
            headers: {
                'User-Agent': 'Startmaps/1.0 (your-email@example.com)' // Replace with your contact email
            }
        });
        if (!response.ok) {
            throw new Error(`Nominatim API error: ${response.status}`);
        }
        const data = await response.json();
        if (data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
        console.warn(`No coordinates found for location: ${location}`);
        return null;
    } catch (error) {
        console.error(`Error geocoding location "${location}":`, error);
        return null;
    }
}

// Function to display featured tournaments on the map
function displayFeaturedTournaments(tournaments) {
    tournaments.forEach(tournament => {
        const { name, lat, lng, startAt, url, games, numAttendees, images } = tournament;

        // Create a marker for the tournament
        const marker = L.marker([lat, lng]).addTo(map);
        allMarkers.push(marker); // Add to global markers array for filtering

        // Create popup content with the specific image for "Round 2! Casual Rounds"
        let imageUrl = Array.isArray(images) && images.length > 0 ? images[0].url : 'path/to/default-image.jpg';
        if (name === "Round 2! Casual Rounds") {
            imageUrl = 'https://pbs.twimg.com/media/GZ27r6FXEAAi6e7?format=jpg&name=large'; // Replace with actual image URL
        }

        const popupContent = `
            <div style="display: flex; align-items: center;">
                <img src="${imageUrl}" onerror="this.src='path/to/default-image.jpg'; this.onerror=null;" style="width: 100px; height: 100px; object-fit: cover;">
                <div style="margin-left: 10px;">
                    <b>${name} (Featured)</b>
                    <br>Games: ${games}
                    <br>Starts at: ${new Date(startAt * 1000).toLocaleString()} UTC
                    <br>Attendees: ${numAttendees || 'Not specified'}
                    <br><a href="${url}" target="_blank">Register</a>
                    <br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(name)} via startmaps.xyz&url=${encodeURIComponent(url)}" target="_blank">Tweet</a>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent);

        // Set a distinct star icon for featured tournaments
        marker.setIcon(L.icon({
            iconUrl: 'custom pin/marker-icon-star.png', // Replace with your star icon path
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }));
    });
}

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
                            <br>Starts at: ${new Date(startAt * 1000).toLocaleString()} UTC
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

// Define selectedGames globally
let selectedGames = new Set();

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

// Function to clear all existing markers and filters from the map
function clearExistingFiltersAndMarkers() {
    // Remove all markers from the map
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Clear the allMarkers array
    allMarkers.length = 0;

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
            await displayData(gameId);
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
    // Reload featured tournaments after search to ensure they reappear
    await loadFeaturedTournaments();
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

// Function to toggle filter options visibility
function toggleFilterOptions() {
    const filterOptions = document.getElementById('filter-options');
    filterOptions.style.display = (filterOptions.style.display === 'none' || filterOptions.style.display === '') ? 'block' : 'none';
}

// Function to select all filters
function selectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateFilters();
}

// Function to deselect all filters
function deselectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateFilters();
}

// Function to select or deselect all checkboxes
function toggleAllCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('.pin-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
        const iconColor = checkbox.id.replace('checkbox-', '');
        filterByIcon(iconColor, checked);
    });
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

// Function to update filters based on checkbox states
function updateFilters() {
    const filterStates = {
        'marker-icon-gold.png': document.getElementById('filter-gold')?.checked,
        'marker-icon-grey.png': document.getElementById('filter-grey')?.checked,
        'marker-icon-black.png': document.getElementById('filter-black')?.checked,
        'marker-icon-violet.png': document.getElementById('filter-violet')?.checked,
        'marker-icon-red.png': document.getElementById('filter-red')?.checked,
        'marker-icon-orange.png': document.getElementById('filter-orange')?.checked,
        'marker-icon-yellow.png': document.getElementById('filter-yellow')?.checked,
        'marker-icon-green.png': document.getElementById('filter-green')?.checked,
        'marker-icon-white.png': document.getElementById('filter-white')?.checked,
        'marker-icon-blue.png': document.getElementById('filter-blue')?.checked,
        'marker-icon-star.png': document.getElementById('filter-star')?.checked // Add star filter
    };

    for (const [iconFile, show] of Object.entries(filterStates)) {
        if (show !== undefined) {
            filterByIcon(iconFile, show);
        }
    }
}

// Event listener for when the DOM content is loaded
document.addEventListener("DOMContentLoaded", function () {
    // Initialize map and other features
    requestLocationAndZoom();
    autocompleteSearch();
    loadFeaturedTournaments(); // Load featured tournaments on page load

    // Add legend for existing icons and featured tournaments
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        // Clear existing legend content to avoid duplication
        legendContainer.innerHTML = '';

        // Add legend items
        const colors = ['gold', 'grey', 'black', 'violet', 'red', 'orange', 'yellow', 'green', 'white', 'blue', 'star'];
        colors.forEach(color => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `
                <input type="checkbox" id="filter-${color}" class="pin-checkbox" checked>
                <img src="custom pin/marker-icon-${color}.png" alt="${color}">
                <label for="filter-${color}">${color === 'star' ? 'Featured Tournaments' : color.charAt(0).toUpperCase() + color.slice(1)}</label>
            `;
            legendContainer.appendChild(legendItem);
        });

        // Add Select All and Deselect All buttons
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

        legendContainer.appendChild(selectAllButton);
        legendContainer.appendChild(deselectAllButton);

        // Add event listeners to checkboxes
        const checkboxes = document.querySelectorAll('.pin-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateFilters);
        });

        // Add buttons for filter options (if needed in legend)
        const filterOptionsContainer = document.createElement('div');
        filterOptionsContainer.id = 'filter-options';
        filterOptionsContainer.style.display = 'none'; // Initially hidden
        colors.forEach(color => {
            const filterOption = document.createElement('div');
            filterOption.className = 'filter-option';
            filterOption.innerHTML = `
                <input type="checkbox" id="filter-${color}" class="pin-checkbox" checked>
                <label for="filter-${color}">${color === 'star' ? 'Featured Tournaments' : color.charAt(0).toUpperCase() + color.slice(1)}</label>
            `;
            filterOptionsContainer.appendChild(filterOption);
        });

        // Add Select All and Deselect All for filter options
        const selectAllFiltersButton = document.createElement('button');
        selectAllFiltersButton.textContent = 'Select All Filters';
        selectAllFiltersButton.addEventListener('click', selectAllFilters);

        const deselectAllFiltersButton = document.createElement('button');
        deselectAllFiltersButton.textContent = 'Deselect All Filters';
        deselectAllFiltersButton.addEventListener('click', deselectAllFilters);

        filterOptionsContainer.appendChild(selectAllFiltersButton);
        filterOptionsContainer.appendChild(deselectAllFiltersButton);

        document.body.appendChild(filterOptionsContainer);
    }
});




