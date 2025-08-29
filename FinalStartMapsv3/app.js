// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'cache.json';

// Initialize the map
var map = L.map('map').setView([0, 0], 2);

// Add a tile layer (you can use other providers or your own)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

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

// Define headers and query for fetching data
var token = "8c3d6ebd26053b772c8fdbd2bd73d78e";
var headers = { "Authorization": "Bearer " + token };

// Global arrays
const allMarkers = [];
const featuredMarkers = []; // keep featured tournaments separate

// ==================== START.GG TOURNAMENTS ====================
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

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const json_data = await response.json();
            const tournaments = json_data.data.tournaments.nodes;
            const filteredTournaments = tournaments.filter(t => t.isRegistrationOpen !== false);
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
                groupedTournaments[key].tournaments.push({
                    name, lat: latNum, lng: lngNum, startAt, url, numAttendees, images
                });
            }
        });

        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup().setLatLng(map.getCenter()).setContent("No Tournaments Found").openOn(map);
            setTimeout(() => map.closePopup(popup), 10000);
        }

        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;
            let totalLat = 0, totalLng = 0;
            tournaments.forEach(t => { totalLat += t.lat; totalLng += t.lng; });
            const avgLat = totalLat / tournaments.length;
            const avgLng = totalLng / tournaments.length;

            let iconColor;
            const numAttendeesGroup = tournaments.reduce((acc, curr) => acc + curr.numAttendees, 0);
            if (tournaments.some(t => t.name.toLowerCase().includes("tekken ball"))) {
                iconColor = 'ball';
            } else if (numAttendeesGroup > 255) {
                iconColor = 'gold';
            } else if (numAttendeesGroup > 127) {
                iconColor = 'grey';
            } else if (withinNext14Days) {
                if (numAttendeesGroup >= 96) iconColor = 'black';
                else if (numAttendeesGroup >= 64) iconColor = 'violet';
                else if (numAttendeesGroup >= 48) iconColor = 'red';
                else if (numAttendeesGroup >= 32) iconColor = 'orange';
                else if (numAttendeesGroup >= 24) iconColor = 'yellow';
                else if (numAttendeesGroup >= 16) iconColor = 'green';
                else iconColor = 'white';
            } else {
                iconColor = 'blue';
            }

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);

            if (tournaments.length > 1) {
                let popupContent = '<ul>';
                tournaments.forEach(t => {
                    const imageUrl = Array.isArray(t.images) ? t.images.find(img => img.type.toLowerCase() === 'profile')?.url : null;
                    const imageElement = imageUrl ? `<img src="${imageUrl}" style="width:100px;height:100px;object-fit:cover;">` : '';
                    popupContent += `<li>${imageElement}<div><b>${t.name}</b><br>Starts: ${new Date(t.startAt * 1000).toLocaleString()}<br>Attendees: ${t.numAttendees}<br><a href="https://start.gg${t.url}" target="_blank">Register</a></div></li>`;
                });
                popupContent += '</ul>';
                marker.bindPopup(popupContent);
            } else {
                const t = tournaments[0];
                marker.bindPopup(`<b>${t.name}</b><br>Starts: ${new Date(t.startAt * 1000).toLocaleString()}<br>Attendees: ${t.numAttendees}<br><a href="https://start.gg${t.url}" target="_blank">Register</a>`);
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

// ==================== GAME FETCH / SEARCH ====================
async function fetchVideoGames() {
    try {
        const response = await fetch(smashGGEndpoint);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        const videoGames = data.entities.videogame;
        const gamesArray = videoGames.map(game => ({
            id: game.id, name: game.name, abbreviation: game.abbreviation || game.name
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
            list: videoGames.map(g => g.name),
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
function clearSelectedGames() { location.reload(); }
function updateSelectedGamesDisplay(videoGames, selectedGames) {
    const display = document.getElementById('selected-games-display');
    const selectedGamesCount = selectedGames.size;
    display.textContent = `${selectedGamesCount} ${selectedGamesCount === 1 ? 'Game' : 'Games'} Selected`;
    document.getElementById('selected-games').value = Array.from(selectedGames).join(',');
}
function addGame(gameID) {
    selectedGames.add(gameID);
    updateSelectedGamesDisplay([], selectedGames);
}

// Clear markers but KEEP featured
function clearExistingFiltersAndMarkers() {
    allMarkers.forEach(marker => { if (map.hasLayer(marker)) map.removeLayer(marker); });
    allMarkers.length = 0; // clear the array
}

async function search() {
    const selectedGameIds = document.getElementById('selected-games').value.split(',').filter(id => id.trim() !== '');
    hideLegend();
    document.getElementById('map-loading-spinner').style.display = 'block';
    clearExistingFiltersAndMarkers();
    if (selectedGameIds.length > 0) {
        for (const gameId of selectedGameIds) await displayData(gameId);
    } else {
        const popup = L.popup().setLatLng(map.getCenter()).setContent("No Games Selected").openOn(map);
        setTimeout(() => map.closePopup(popup), 5000);
        document.getElementById('game-search').value = '';
        showLegend();
    }
    document.getElementById('map-loading-spinner').style.display = 'none';
}

// ==================== LEGEND FILTERS ====================
function hideLegend() { const lc = document.querySelector('.legend-container'); if (lc) lc.style.display = 'none'; }
function showLegend() { const lc = document.querySelector('.legend-container'); if (lc) lc.style.display = 'block'; }
function updateFilters() { /* left as-is for brevity */ }

// ==================== FEATURED TOURNAMENTS ====================
async function fetchFeaturedTournaments() {
    try {
        const response = await fetch('FeaturedEvents.csv');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const csvText = await response.text();
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true, skipEmptyLines: true,
                complete: results => resolve(results.data),
                error: err => reject(err)
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
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        else return null;
    } catch (error) {
        console.error(`Error geocoding location "${location}":`, error);
        return null;
    }
}

async function displayFeaturedTournaments() {
    try {
        const tournaments = await fetchFeaturedTournaments();
        if (tournaments.length === 0) return;
        const currentTime = new Date().getTime();
        for (const tournament of tournaments) {
            const { 'Tournament name': name, 'Start Date/Time': startTime, Location: location, 'Sign up link': url, Games: games } = tournament;
            if (!name || !startTime || !location) continue;
            let startDate = new Date(startTime);
            if (isNaN(startDate.getTime())) {
                const [day, month, year] = startTime.split('/').map(Number);
                startDate = new Date(year, month - 1, day);
            }
            const tournamentTime = startDate.getTime();
            if (tournamentTime <= currentTime) continue;
            const coords = await geocodeLocation(location);
            if (!coords) continue;
            const { lat, lng } = coords;

            const marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'featuredlogo.png',
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

            marker.bindPopup(`
                <div style="display: flex; align-items: center;">
                    <img src="/path/to/default-image.jpg" style="width: 100px; height: 100px; object-fit: cover;">
                    <div style="margin-left: 10px;">
                        <b>${name}</b>
                        <br>Starts at: ${startDate.toLocaleString()} UTC
                        <br>Location: ${location}
                        <br>Games: ${cleanedGames}
                        ${registerLink}
                        ${tweetLink}
                    </div>
                </div>
            `);
        }
    } catch (error) {
        console.error('Error displaying featured tournaments:', error);
    }
}

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", function () {
    requestLocationAndZoom();
    autocompleteSearch();
    updateFilters();
    displayFeaturedTournaments(); // always visible, persists after search
});
