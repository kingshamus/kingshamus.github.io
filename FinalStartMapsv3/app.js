// =========================== CONFIG ===========================
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
var smashGGEndpoint   = 'cache.json';

// Start.gg API
var token   = "8c3d6ebd26053b772c8fdbd2bd73d78e";
var headers = { "Authorization": "Bearer " + token };

// ====================== MAP INITIALIZATION =====================
var map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// ===================== GEOLOCATION + ZOOM ======================
function requestLocationAndZoom() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function (position) {
      var latitude  = position.coords.latitude;
      var longitude = position.coords.longitude;

      map.setView([latitude, longitude], 3);

      var currentZoom   = map.getZoom();
      var targetZoom    = 10;
      var zoomDiff      = targetZoom - currentZoom;
      var duration      = 3000;
      var interval      = 20;
      var steps         = duration / interval;
      var zoomIncrement = zoomDiff / steps;
      var stepCount     = 0;

      function gradualZoom() {
        stepCount++;
        var newZoom = currentZoom + zoomIncrement * stepCount;
        map.setZoom(newZoom);
        if (stepCount >= steps) clearInterval(zoomInterval);
      }
      var zoomInterval = setInterval(gradualZoom, interval);
    }, function (error) {
      console.error('Error getting user location:', error);
    });
  } else {
    console.error('Geolocation is not supported by this browser.');
  }
}

// ========================= GLOBAL STATE ========================
const allMarkers      = []; // regular tournament markers (filterable/clearable)
const featuredMarkers = []; // featured tournament markers (ALWAYS visible, never cleared)

let selectedGames = new Set(); // used by search

// =================== START.GG TOURNAMENT QUERY =================
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
          variables: { perPage: 300, page, videogameId }
        }),
      });
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const json_data   = await response.json();
      const tournaments = json_data?.data?.tournaments?.nodes || [];
      const filtered    = tournaments.filter(t => t.isRegistrationOpen !== false);
      allTournaments    = allTournaments.concat(filtered);
    }
    return allTournaments;
  } catch (error) {
    console.error(`Error fetching data: ${error.message}`);
    throw error;
  }
}

// ==================== RENDER START.GG MARKERS ==================
async function displayData(gameId) {
  try {
    const { games: videoGames } = await fetchVideoGames();
    const groupedTournaments = {};
    const selectedGame       = videoGames.find(g => g.id === gameId);
    const gameName           = selectedGame ? selectedGame.name : 'Unknown Game';
    const data               = await fetchData(gameId);
    const nowMs              = Date.now();

    // group by identical coords to avoid overlapping pins
    data.forEach(t => {
      const { name, lat, lng, startAt, url, numAttendees, images } = t;
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (isNaN(latNum) || isNaN(lngNum) || lat === null || lng === null) return;

      const timeDiffMs        = startAt * 1000 - nowMs;
      const withinNext14Days  = timeDiffMs <= 14 * 24 * 60 * 60 * 1000;
      const key               = `${latNum},${lngNum}`;
      if (!groupedTournaments[key]) {
        groupedTournaments[key] = { tournaments: [], withinNext14Days };
      }
      groupedTournaments[key].tournaments.push({
        name, lat: latNum, lng: lngNum, startAt, url, numAttendees, images
      });
    });

    if (Object.keys(groupedTournaments).length === 0) {
      const popup = L.popup().setLatLng(map.getCenter()).setContent("No Tournaments Found").openOn(map);
      setTimeout(() => map.closePopup(popup), 10000);
      return;
    }

    Object.values(groupedTournaments).forEach(group => {
      const { tournaments, withinNext14Days } = group;
      // average coords for the group
      const avgLat = tournaments.reduce((s, t) => s + t.lat, 0) / tournaments.length;
      const avgLng = tournaments.reduce((s, t) => s + t.lng, 0) / tournaments.length;

      // color logic
      const totalAttendees = tournaments.reduce((s, t) => s + (t.numAttendees || 0), 0);
      let iconColor;
      if (tournaments.some(t => t.name?.toLowerCase().includes("tekken ball"))) {
        iconColor = 'ball';
      } else if (totalAttendees > 255) {
        iconColor = 'gold';
      } else if (totalAttendees > 127) {
        iconColor = 'grey';
      } else if (withinNext14Days) {
        if (totalAttendees >= 96)      iconColor = 'black';
        else if (totalAttendees >= 64) iconColor = 'violet';
        else if (totalAttendees >= 48) iconColor = 'red';
        else if (totalAttendees >= 32) iconColor = 'orange';
        else if (totalAttendees >= 24) iconColor = 'yellow';
        else if (totalAttendees >= 16) iconColor = 'green';
        else                           iconColor = 'white';
      } else {
        iconColor = 'blue';
      }

      const marker = L.marker([avgLat, avgLng]).addTo(map);
      allMarkers.push(marker);

      // ---- popup: support images + register + tweet, for both grouped & single ----
      if (tournaments.length > 1) {
        let popupContent = '<ul style="padding-left: 1rem; margin: 0;">';
        tournaments.forEach(t => {
          const imageUrl = (Array.isArray(t.images) ? t.images.find(img => {
            const typ = (img?.type || '').toString().toLowerCase();
            return typ === 'profile' || typ === 'banner' || typ === 'image';
          })?.url : null) || null;

          const imgEl = imageUrl
            ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">`
            : '<img src="/path/to/default-image.jpg" onerror="this.style.display=\'none\'" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">';

          const startStr = new Date(t.startAt * 1000).toLocaleString();
          const fullUrl  = `https://start.gg${t.url}`;
          const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `I'm signing up for ${t.name} via startmaps.xyz`
          )}&url=${encodeURIComponent(fullUrl)}`;

          popupContent += `
            <li style="display:flex;align-items:center;gap:10px;margin:10px 0;">
              ${imgEl}
              <div style="line-height:1.2;">
                <b>${t.name}</b>
                <br>Starts at: ${startStr} UTC
                <br>Attendees: ${t.numAttendees ?? 0}
                <br><a href="${fullUrl}" target="_blank" rel="noopener">Register</a>
                <br><a href="${tweetUrl}" target="_blank" rel="noopener">Tweet</a>
              </div>
            </li>
          `;
        });
        popupContent += '</ul>';
        marker.bindPopup(popupContent);
      } else {
        const t       = tournaments[0];
        const imageUrl = (Array.isArray(t.images) ? t.images.find(img => {
          const typ = (img?.type || '').toString().toLowerCase();
          return typ === 'profile' || typ === 'banner' || typ === 'image';
        })?.url : null) || null;

        const imgEl = imageUrl
          ? `<img src="${imageUrl}" onerror="this.style.display='none'" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">`
          : '<img src="/path/to/default-image.jpg" onerror="this.style.display=\'none\'" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">';

        const startStr = new Date(t.startAt * 1000).toLocaleString();
        const fullUrl  = `https://start.gg${t.url}`;
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          `I'm signing up for ${t.name} via startmaps.xyz`
        )}&url=${encodeURIComponent(fullUrl)}`;

        marker.bindPopup(`
          <div style="display:flex;align-items:center;gap:10px;">
            ${imgEl}
            <div style="line-height:1.2;">
              <b>${t.name}</b>
              <br>Starts at: ${startStr} UTC
              <br>Attendees: ${t.numAttendees ?? 0}
              <br><a href="${fullUrl}" target="_blank" rel="noopener">Register</a>
              <br><a href="${tweetUrl}" target="_blank" rel="noopener">Tweet</a>
            </div>
          </div>
        `);
      }

      marker.setIcon(L.icon({
        iconUrl: `custom pin/marker-icon-${iconColor}.png`,
        iconSize:   [25, 41],
        iconAnchor: [12, 41],
        popupAnchor:[1, -34],
        shadowSize: [41, 41]
      }));
    });
  } catch (error) {
    console.error(`Error displaying data: ${error.message}`);
  }
}

// ================== GAME LIST (cache.json) + UI =================
async function fetchVideoGames() {
  try {
    const response = await fetch(smashGGEndpoint);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data       = await response.json();
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
    const localSelected = new Set();

    new Awesomplete(input, {
      list: videoGames.map(g => g.name),
      autoFirst: true,
      filter: function (text, inputVal) {
        const searchTerm = inputVal.trim().toLowerCase();
        const game       = gameLookup.get(text.toLowerCase());
        if (!game) return false;
        return game.name.toLowerCase().startsWith(searchTerm) ||
               game.abbreviation.toLowerCase().startsWith(searchTerm);
      }
    });

    input.addEventListener('awesomplete-selectcomplete', function (event) {
      const selectedGameName = event.text;
      const game = gameLookup.get(selectedGameName.toLowerCase());
      if (game) {
        localSelected.add(game.id);
        selectedGames = localSelected; // keep global in sync
        updateSelectedGamesDisplay(videoGames, selectedGames);
        input.value = '';
      }
    });

    updateSelectedGamesDisplay(videoGames, selectedGames);
  } catch (error) {
    console.error('Error in autocompleteSearch:', error);
  }
}

function updateSelectedGamesDisplay(videoGames, selectedGames) {
  const display = document.getElementById('selected-games-display');
  const count   = selectedGames.size;
  if (display) {
    display.textContent = `${count} ${count === 1 ? 'Game' : 'Games'} Selected`;
  }
  const hidden = document.getElementById('selected-games');
  if (hidden) hidden.value = Array.from(selectedGames).join(',');
}

function clearSelectedGames() { location.reload(); }
function addGame(gameID) {
  selectedGames.add(gameID);
  updateSelectedGamesDisplay([], selectedGames);
}

// ========== CLEAR / SEARCH (do not remove featured markers) ==========
function clearExistingFiltersAndMarkers() {
  // remove regular markers from map
  allMarkers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  allMarkers.length = 0; // keep array but empty

  // DO NOT touch featuredMarkers → they remain visible
}

async function search() {
  const hidden = document.getElementById('selected-games');
  const selectedGameIds = hidden ? hidden.value.split(',').filter(id => id.trim() !== '') : [];
  hideLegend();
  const spinner = document.getElementById('map-loading-spinner');
  if (spinner) spinner.style.display = 'block';

  clearExistingFiltersAndMarkers();

  if (selectedGameIds.length > 0) {
    for (const id of selectedGameIds) {
      await displayData(id);
    }
  } else {
    const popup = L.popup().setLatLng(map.getCenter()).setContent("No Games Selected").openOn(map);
    setTimeout(() => map.closePopup(popup), 5000);
    const input = document.getElementById('game-search');
    if (input) input.value = '';
    showLegend();
  }

  if (spinner) spinner.style.display = 'none';
}

// ======================== LEGEND & FILTERS ======================
function hideLegend() {
  const legendContainer = document.querySelector('.legend-container');
  if (legendContainer) legendContainer.style.display = 'none';
}
function showLegend() {
  const legendContainer = document.querySelector('.legend-container');
  if (legendContainer) legendContainer.style.display = 'block';
}

// optional: toggle a dropdown of filters if you have a button
function toggleFilterOptions() {
  const filterOptions = document.getElementById('filter-options');
  if (filterOptions) {
    filterOptions.style.display = (filterOptions.style.display === 'none' || filterOptions.style.display === '') ? 'block' : 'none';
  }
}
function selectAllFilters() {
  const boxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
  boxes.forEach(cb => cb.checked = true);
  updateFilters();
}
function deselectAllFilters() {
  const boxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
  boxes.forEach(cb => cb.checked = false);
  updateFilters();
}

// Show/hide REGULAR markers by icon filename (featured are never touched)
function filterByIconFilename(filename, show) {
  allMarkers.forEach(marker => {
    const iconUrl = marker?.options?.icon?.options?.iconUrl || '';
    if (iconUrl.includes(filename)) {
      if (show && !map.hasLayer(marker)) map.addLayer(marker);
      if (!show && map.hasLayer(marker)) map.removeLayer(marker);
    }
  });
}

// Main filter update (expects checkboxes with IDs like #filter-gold, #filter-blue, etc.)
function updateFilters() {
  // read states if elements exist; default true
  const state = (id) => {
    const el = document.getElementById(id);
    return el ? !!el.checked : true;
  };

  const filters = [
    ['marker-icon-gold.png',   state('filter-gold')],
    ['marker-icon-grey.png',   state('filter-grey')],
    ['marker-icon-black.png',  state('filter-black')],
    ['marker-icon-violet.png', state('filter-violet')],
    ['marker-icon-red.png',    state('filter-red')],
    ['marker-icon-orange.png', state('filter-orange')],
    ['marker-icon-yellow.png', state('filter-yellow')],
    ['marker-icon-green.png',  state('filter-green')],
    ['marker-icon-white.png',  state('filter-white')],
    ['marker-icon-blue.png',   state('filter-blue')],
    ['marker-icon-ball.png',   state('filter-ball')]
  ];

  // apply to regular markers only
  filters.forEach(([file, show]) => filterByIconFilename(file, show));

  // IMPORTANT: featured markers always visible (no-op here)
}

// Add "Select All" / "Deselect All" convenience buttons to legend if present
(function attachLegendButtons() {
  const legendContainer = document.querySelector('.legend-container');
  if (!legendContainer) return;

  const addBtn = (text, onClick) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.classList.add('legend-button');
    btn.addEventListener('click', onClick);
    return btn;
  };
  legendContainer.appendChild(addBtn('Select All',   selectAllFilters));
  legendContainer.appendChild(addBtn('Deselect All', deselectAllFilters));
})();

// If you also have legacy "pin-checkbox" controls and want a global toggle:
function toggleAllCheckboxes(checked) {
  const checkboxes = document.querySelectorAll('.pin-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.checked = checked;
    const iconColor = checkbox.id.replace('checkbox-', '');
    const filename  = `marker-icon-${iconColor}.png`;
    filterByIconFilename(filename, checked);
  });
}

// When DOM is ready, wire up filter checkboxes (if present)
document.addEventListener("DOMContentLoaded", function () {
  const boxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
  boxes.forEach(cb => cb.addEventListener('change', updateFilters));
  updateFilters(); // initialize to current checkbox states
});

// ===================== FEATURED TOURNAMENTS =====================
async function fetchFeaturedTournaments() {
  try {
    const response = await fetch('FeaturedEvents.csv');
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: res => resolve(res.data),
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
    const response = await fetch(
      `${nominatimEndpoint}?q=${encodeURIComponent(location)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Startmaps/1.0 (your-email@example.com)' } }
    );
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
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
    if (!Array.isArray(tournaments) || tournaments.length === 0) {
      console.warn('No featured tournaments found in CSV.');
      return;
    }

    const nowMs = Date.now();

    for (const row of tournaments) {
      const name     = row['Tournament name'];
      const startStr = row['Start Date/Time'];
      const location = row['Location'];
      const url      = row['Sign up link'];
      const games    = row['Games'];

      if (!name || !startStr || !location) {
        console.error(`Invalid tournament data: ${JSON.stringify(row)}`);
        continue;
      }

      // parse date
      let startDate = new Date(startStr);
      if (isNaN(startDate.getTime())) {
        // Fallback for dd/mm/yyyy
        const parts = (startStr || '').split('/').map(Number);
        if (parts.length === 3) {
          const [day, month, year] = parts;
          startDate = new Date(year, (month || 1) - 1, day || 1);
        }
      }
      const startMs = startDate.getTime();
      if (!isNaN(startMs) && startMs <= nowMs) {
        // Skip past featured events
        continue;
      }

      const coords = await geocodeLocation(location);
      if (!coords) continue;

      const marker = L.marker([coords.lat, coords.lng], {
        icon: L.icon({
          iconUrl: 'featuredlogo.png',
          iconSize:   [25, 41],
          iconAnchor: [12, 41],
          popupAnchor:[1, -34],
          shadowSize: [41, 41]
        })
      }).addTo(map);

      featuredMarkers.push(marker);

const cleanedGames = games ? games.trim().replace(/,\s*$/, '') : 'Not specified';
const registerLink = url ? `<br><a href="${url}" target="_blank">Register</a>` : '';
const tweetLink = url ? `<br><a href="https://twitter.com/intent/tweet?text=I'm signing up for ${encodeURIComponent(name)} via startmaps.xyz&url=${encodeURIComponent(url)}" target="_blank">Tweet</a>` : '';

const popupContent = `
    <div style="display: flex; align-items: center; pointer-events: auto;">
        <img src="/path/to/default-image.jpg" 
             alt="No Image Available" 
             style="width: 100px; height: 100px; object-fit: cover; pointer-events: none;">
        <div style="margin-left: 10px;">
            <b>${name}</b>
            <br>Starts at: ${new Date(formattedStartTime).toLocaleString()} UTC
            <br>Location: ${location}
            <br>Games: ${cleanedGames}
            ${registerLink}
            ${tweetLink}
        </div>
    </div>
`;
marker.bindPopup(popupContent, { closeButton: true });

      
    }
  } catch (error) {
    console.error('Error displaying featured tournaments:', error);
  }
}

// ============================ INIT =============================
document.addEventListener("DOMContentLoaded", function () {
  requestLocationAndZoom();
  autocompleteSearch();

  // Wire filters if your HTML includes #filter-options with checkboxes
  const filterBoxes = document.querySelectorAll('#filter-options .filter-option input[type="checkbox"]');
  filterBoxes.forEach(cb => cb.addEventListener('change', updateFilters));
  updateFilters();

  // Always-visible Featured Tournaments
  displayFeaturedTournaments();
});


