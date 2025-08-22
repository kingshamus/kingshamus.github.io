// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'cache.json';

// Function to request location permission and zoom if allowed
function requestLocationAndZoom() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;

            map.setView([latitude, longitude], 3);

            var currentZoom = map.getZoom();
            var targetZoom = 10;
            var zoomDiff = targetZoom - currentZoom;
            var duration = 3000;
            var interval = 20;
            var steps = duration / interval;
            var zoomIncrement = zoomDiff / steps;
            var stepCount = 0;

            function gradualZoom() {
                stepCount++;
                var newZoom = currentZoom + zoomIncrement * stepCount;
                map.setZoom(newZoom);
                if (stepCount >= steps) {
                    clearInterval(zoomInterval);
                }
            }

            var zoomInterval = setInterval(gradualZoom, interval);
        }, function (error) {
            console.error('Error getting user location:', error);
        });
    } else {
        console.error('Geolocation is not supported by this browser.');
    }
}

document.addEventListener("DOMContentLoaded", function () {
    requestLocationAndZoom();
    displayFeaturedTournaments(); // Display featured tournaments on load
});

// Initialize the map
var map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

var token = "8c3d6ebd26053b772c8fdbd2bd73d78e";
var headers = { "Authorization": "Bearer " + token };

async function fetchData(videogameId) {
    try {
        let allTournaments = [];
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
      videogameIds: [$videogameId]
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

async function displayData(gameId) {
    try {
        const { games: videoGames } = await fetchVideoGames();
        const groupedTournaments = {};
        const selectedGame = videoGames.find(game => game.id === gameId);
        const gameName = selectedGame ? selectedGame.name : 'Unknown Game';

        const data = await fetchData(gameId);
        const currentTime = new Date().getTime();

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url, numAttendees, images } = tournament;
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                const timeDifference = startAt * 1000 - currentTime;
                const withinNext14Days = timeDifference <= 14 * 24 * 60 * 60 * 1000;
                const key = `${latNum},${lngNum}`;
                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = { tournaments: [], withinNext14Days };
                }
                groupedTournaments[key].tournaments.push({ name, lat: latNum, lng: lngNum, startAt, url, numAttendees, images });
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });

        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("No Tournaments Found")
                .openOn(map);
            setTimeout(function () { map.closePopup(popup); }, 10000);
        }

        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;
            let totalLat = 0, totalLng = 0;
            tournaments.forEach(tournament => { totalLat += tournament.lat; totalLng += tournament.lng; });
            const avgLat = totalLat / tournaments.length;
            const avgLng = totalLng / tournaments.length;

            let iconColor;
            const numAttendeesGroup = tournaments.reduce((acc, curr) => acc + curr.numAttendees, 0);
            if (tournaments.some(tournament => tournament.name.toLowerCase().includes("tekken ball"))) {
                iconColor = 'ball';
            } else if (tournaments.some(tournament => ["evo japan 2024", "evo 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold';
            } else if (tournaments.some(tournament => ["paradise game battle 2024", "combo breaker 2024", "battle arena melbourne 2024", "tgu 2024", "punishment 2", "the mixup 2024", "ceo 2024", "atl super tournament 2024", "vsfighting xii", "emirates showdown 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold';
            } else if (tournaments.some(tournament => ["electric clash 2024", "only the best 2024", "ufa 2024", "3f - fight for the future", "second wind 2024", "thunderstruck 2024", "brussels challenge 2024", "fv major 2024", "clash of the olympians 2024", "dreamhack dallas 2024", "crossover 2024", "cape town showdown 2024", "hado fight festival", "moor1ng"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'grey';
            } else if (numAttendeesGroup > 255) {
                iconColor = 'gold';
            } else if (numAttendeesGroup > 127) {
                iconColor = 'grey';
            } else if (withinNext14Days) {
                if (numAttendeesGroup >= 96) { iconColor = 'black'; }
                else if (numAttendeesGroup >= 64) { iconColor = 'violet'; }
                else if (numAttendeesGroup >= 48) { iconColor = 'red'; }
                else if (numAttendeesGroup >= 32) { iconColor = 'orange'; }
                else if (numAttendeesGroup >= 24) { iconColor = 'yellow'; }
                else if (numAttendeesGroup >= 16) { iconColor = 'green'; }
                else { iconColor = 'white'; }
            } else {
                iconColor = 'blue';
            }

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);

            if (tournaments.length > 1) {
                let popupContent = '<ul>';
                tournaments.forEach(tournament => {
                    const imageUrl = Array.isArray(tournament.images) ? tournament.images.find(img => img.type.toLowerCase() === 'profile')?.url || 'No Image' : 'No Image';
                    const imageElement = imageUrl !== 'No Image' ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width: 100px; height: 100px; object-fit: cover;">` : '<img src="/path/to/default-image.jpg" alt="No Image Available" style="width: 100px; height: 100px; object-fit: cover;">';
                    popupContent += `<li style="display: flex; align-items: center;">${imageElement}<div style="margin-left: 10px;"><b>${tournament.name}</b><br>Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()}<br>Attendees: ${tournament.numAttendees}<br><a href="https://start.gg${tournament.url}" target="_blank">Register</a><br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(tournament.name)} via startmaps.xyz&url=${encodeURIComponent(`https://start.gg${tournament.url}`)}" target="_blank">Tweet</a></div></li>`;
                });
                popupContent += '</ul>';
                marker.bindPopup(popupContent);
            } else {
                const { name, startAt, url, numAttendees, images } = tournaments[0];
                const imageUrl = Array.isArray(images) ? images.find(img => img.type.toLowerCase() === 'profile')?.url || 'No Image' : 'No Image';
                const imageElement = imageUrl !== 'No Image' ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width: 100px; height: 100px; object-fit: cover;">` : '<img src="/path/to/default-image.jpg" alt="No Image Available" style="width: 100px; height: 100px; object-fit: cover;">';
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

async function fetchVideoGames() {
    try {
        const response = await fetch(smashGGEndpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        const videoGames = data.entities.videogame;
        const gamesArray = videoGames.map(game => ({
            id: game.id,
            name: game.name,
            abbreviation: game.abbreviation || game.name
        }));
        const gameLookup = new Map();
        gamesArray.forEach(game => {
            gameLookup.set(game.name.toLowerCase(), game);
            gameLookup.set(game.abbreviation.toLowerCase(), game);
        });
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
        const selectedGames = new Set();

        new Awesomplete(input, {
            list: videoGames.map(game => game.name),
            autoFirst: true,
            filter: function(text, input) {
                const searchTerm = input.trim().toLowerCase();
                const game = gameLookup.get(text.toLowerCase());
                if (!game) return false;
                return game.name.toLowerCase().startsWith(searchTerm) || game.abbreviation.toLowerCase().startsWith(searchTerm);
            }
        });

        input.addEventListener('awesomplete-selectcomplete', function(event) {
            const selectedGameName = event.text;
            const game = gameLookup.get(selectedGameName.toLowerCase());
            if (game) {
                selectedGames.add(game.id);
                updateSelectedGamesDisplay(videoGames, selectedGames);
                input.value = '';
            }
        });

        updateSelectedGamesDisplay(videoGames, selectedGames);
    } catch (error) {
        console.error('Error in autocompleteSearch:', error);
    }
}

let selectedGames = new Set();

function clearSelectedGames() {
    location.reload();
}

function updateSelectedGamesDisplay(videoGames, selectedGames) {
    const display = document.getElementById('selected-games-display');
    const selectedGamesCount = selectedGames instanceof Set ? selectedGames.size : selectedGames.length;
    display.textContent = `${selectedGamesCount} ${selectedGamesCount === 1 ? 'Game' : 'Games'} Selected`;
    document.getElementById('selected-games').value = Array.from(selectedGames).join(',');
}

function addGame(gameID) {
    if (selectedGames instanceof Set) {
        selectedGames.add(gameID);
    } else {
        console.error('selectedGames is not a Set');
    }
    updateSelectedGamesDisplay([], selectedGames);
}

function clearExistingFiltersAndMarkers() {
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && !featuredMarkers.includes(layer)) {
            map.removeLayer(layer);
        }
    });
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
}

function hideLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'none';
    }
}

function showLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'block';
    }
}

function toggleAllCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('.pin-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
        const iconColor = checkbox.id.replace('checkbox-', '');
        filterMarkers(iconColor, checked);
    });
}

const selectAllButton = document.createElement('button');
selectAllButton.textContent = 'Select All';
selectAllButton.classList.add('legend-button');
selectAllButton.addEventListener('click', function() { toggleAllCheckboxes(true); });

const deselectAllButton = document.createElement('button');
deselectAllButton.textContent = 'Deselect All';
deselectAllButton.classList.add('legend-button');
deselectAllButton.addEventListener('click', function() { toggleAllCheckboxes(false); });

const legendContainer = document.querySelector('.legend-container');
if (legendContainer) {
    legendContainer.appendChild(selectAllButton);
    legendContainer.appendChild(deselectAllButton);
}

const allMarkers = [];
const featuredMarkers = []; // Separate array for featured tournament markers

function toggleFilterOptions() {
    const filterOptions = document.getElementById('filter-options');
    filterOptions.style.display = (filterOptions.style.display === 'none' || filterOptions.style.display === '') ? 'block' : 'none';
}

function selectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = true);
    updateFilters();
}

function deselectAllFilters() {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateFilters();
}

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
        'marker-icon-blue.png': document.getElementById('filter-blue').checked,
        'marker-icon-star.png': document.getElementById('filter-star').checked
    };

    for (const [iconFile, show] of Object.entries(filterStates)) {
        filterByIcon(iconFile, show);
    }
}

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
    featuredMarkers.forEach(marker => {
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

document.addEventListener("DOMContentLoaded", function () {
    const checkboxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateFilters);
    });
    updateFilters();
    autocompleteSearch();
});

async function fetchFeaturedTournaments() {
    try {
        const response = await fetch('FeaturedEvents.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const csvText = await response.text();
        
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    resolve(results.data);
                },
                error: function (error) {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error('Error fetching featured tournaments:', error);
        return [];
    }
}

async function geocodeLocation(location) {
    try {
        const response = await fetch(`${nominatimEndpoint}?q=${encodeURIComponent(location)}&format=json&limit=1`, {
            headers: { 'User-Agent': 'Startmaps/1.0 (your-email@example.com)' }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } else {
            console.error(`No geocoding results for location: ${location}`);
            return null;
        }
    } catch (error) {
        console.error(`Error geocoding location "${location}":`, error);
        return null;
    }
}

async function displayFeaturedTournaments() {
    try {
        const tournaments = await fetchFeaturedTournaments();
        if (tournaments.length === 0) {
            console.warn('No featured tournaments found in CSV.');
            return;
        }

        // Current date and time (August 22, 2025, 11:54 AM UTC)
        const currentTime = new Date("2025-08-22T11:54:00Z").getTime();

        for (const tournament of tournaments) {
            const { 'Tournament name': name, 'Start Date/Time': startTime, Location: location, 'Sign up link': url, Games: games } = tournament;

            if (!name || !startTime || !location) {
                console.error(`Invalid tournament data: ${JSON.stringify(tournament)}`);
                continue;
            }

            // Convert start time to ISO format
            let startDate = new Date(startTime);
            if (isNaN(startDate.getTime())) {
                const [day, month, year] = startTime.split('/').map(Number);
                startDate = new Date(year, month - 1, day); // month is 0-indexed
            }
            const formattedStartTime = startDate.toISOString();
            const tournamentTime = new Date(formattedStartTime).getTime();

            // Skip if the tournament has already taken place
            if (tournamentTime <= currentTime) {
                console.log(`Skipping past tournament: ${name} (starts ${formattedStartTime})`);
                continue;
            }

            const coords = await geocodeLocation(location);
            if (!coords) {
                console.error(`Skipping tournament "${name}" due to geocoding failure.`);
                continue;
            }

            const { lat, lng } = coords;

            const marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'custom pin/marker-icon-star.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(map);

            featuredMarkers.push(marker);

            const cleanedGames = games ? games.trim().replace(/,\s*$/, '') : 'Not specified';
            const registerLink = url ? `<br><a href="${url}" target="_blank">Register</a>` : '';
            const tweetLink = url ? `<br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(name)} via startmaps.xyz&url=${encodeURIComponent(url)}" target="_blank">Tweet</a>` : '';

            const popupContent = `
                <div style="display: flex; align-items: center;">
                    <img src="/path/to/default-image.jpg" alt="No Image Available" style="width: 100px; height: 100px; object-fit: cover;">
                    <div style="margin-left: 10px;">
                        <b>${name}</b>
                        <br>Starts at: ${new Date(formattedStartTime).toLocaleString()}UTC
                        <br>Location: ${location}
                        <br>Games: ${cleanedGames}
                        ${registerLink}
                        ${tweetLink}
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent);
        }
    } catch (error) {
        console.error('Error displaying featured tournaments:', error);
    }
}