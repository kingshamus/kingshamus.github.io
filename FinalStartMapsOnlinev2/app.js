let cacheData; // Define cacheData in the global scope

// Fetch cache.json file
axios.get('cache.json?ts=1728051270')
  .then(response => {
    cacheData = response.data; // Assign the fetched data to cacheData
    const gameNames = cacheData.entities.videogame.map(game => game.name);

    // Set up autofill for the search bar
    const gameNameInput = document.getElementById('gameName');
    const gameList = document.getElementById('gameList');
    gameNames.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      gameList.appendChild(option);
    });
  })
  .catch(error => {
    console.error('Error fetching cache.json:', error);
  });

function generateSpreadsheet() {
  const gameName = document.getElementById('gameName').value;
  const gameId = getGameIdFromName(gameName);
  if (gameId) {
    fetchTournaments(gameId);
  } else {
    alert('Invalid game name');
  }
}

function getGameIdFromName(gameName) {
  const game = cacheData.entities.videogame.find(game => game.name === gameName);
  return game ? game.id : null;
}

function fetchTournaments(gameId) {
  const token = "8c3d6ebd26053b772c8fdbd2bd73d78e"; // Replace with your updated token
  const headers = { "Authorization": "Bearer " + token };
  const totalPages = 10; // Number of pages to fetch

  // Show loading spinner
  document.getElementById('loadingSpinner').style.display = 'block';

  // Function to fetch tournaments for a given page number
  function fetchPage(page) {
    const query = `query TournamentsByVideogame($perPage: Int!, $page: Int!, $videogameId: ID!) {
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
          numAttendees
          isRegistrationOpen
          startAt
          countryCode
          addrState
          city
          isOnline
        }
      }
    }`;

    const variables = {
      perPage: 250,
      page: page,
      videogameId: parseInt(gameId)
    };

    const url = 'https://api.start.gg/gql/alpha';

    return axios.post(url, { query, variables }, { headers })
      .then(response => response.data.data.tournaments.nodes)
      .catch(error => {
        console.error('Error fetching tournaments for page ' + page + ':', error);
        return []; // Return empty array in case of error
      });
  }

  // Array to store all promises for fetching pages
  let pagePromises = [];

  // Generate promises for fetching each page
  for (let page = 1; page <= totalPages; page++) {
    pagePromises.push(fetchPage(page));
  }

  // Execute promises in parallel
  Promise.all(pagePromises)
    .then(results => {
      // Flatten the array of arrays into a single array of tournaments
      const allTournaments = results.flat();

      const formattedTournaments = allTournaments.map(tournament => ({
        Name: tournament.name,
        Start_Time_UTC: moment.unix(tournament.startAt).utc().format('YYYY-MM-DD HH:mm:ss'),
        Country_Code: tournament.countryCode,
        State: tournament.addrState,
        City: tournament.city,
        Attendees: tournament.numAttendees,
        Is_Online: tournament.isOnline ? "Yes" : "No",
        Link: `https://start.gg${tournament.url}`
      }));

      // Initialize Tabulator with responsive layout and minimum column widths
      const table = new Tabulator("#tableElement", {
        layout: "fitDataFill",
        columns: [
          { title: 'Name', field: 'Name', minWidth: 200, maxWidth: 200, headerFilter: false },
          { title: 'Start Time (UTC)', field: 'Start_Time_UTC', minWidth: 150, maxWidth: 150, headerFilter: false },
          { title: 'Country Code', field: 'Country_Code', minWidth: 100, maxWidth: 100, headerFilter: "select", headerFilterParams: { values: true } },
          { title: 'State', field: 'State', minWidth: 100, maxWidth: 100, headerFilter: "select", headerFilterParams: { values: true } },
          { title: 'City', field: 'City', minWidth: 100, maxWidth: 100, headerFilter: "select", headerFilterParams: { values: true } },
          { title: 'Attendees', field: 'Attendees', minWidth: 100, maxWidth: 100, headerFilter: false },
          { title: 'Is Online?', field: 'Is_Online', minWidth: 100, maxWidth: 100, headerFilter: "select", headerFilterParams: { values: true } },
          { title: 'Link', field: 'Link', formatter: 'link', formatterParams: { label: 'Visit', target: '_blank' }, minWidth: 100, maxWidth: 100 }
        ],
        data: formattedTournaments
      });

      // Hide loading spinner
      document.getElementById('loadingSpinner').style.display = 'none';

      // Show table container
      document.getElementById('tableContainer').style.display = 'block';
    })
    .catch(error => {
      console.error('Error fetching tournaments:', error);
      // Hide loading spinner in case of error
      document.getElementById('loadingSpinner').style.display = 'none';
    });
}
