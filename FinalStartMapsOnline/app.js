const axios = require('axios');
const moment = require('moment');
const { createTable } = require('tabulator');

const token = "c2a8a8f10786247a50b5be6cb87bc012";
const headers = { "Authorization": "Bearer " + token };

const query = `query TournamentsByVideogame($perPage: Int!, $videogameId: ID!) {
  tournaments(query: {
    perPage: $perPage
    page: 1
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
      isRegistrationOpen
      startAt
      isOnline
      countryCode
    }
  }
}`;

const variables = {
  perPage: 300,
  videogameId: 49783
};

const url = 'https://api.start.gg/gql/alpha';

axios.post(url, { query, variables }, { headers })
  .then(response => {
    const tournaments = response.data.data.tournaments.nodes;
    const filteredTournaments = tournaments.filter(tournament => tournament.isRegistrationOpen && tournament.isOnline);

    const formattedTournaments = filteredTournaments.map(tournament => ({
      Name: tournament.name,
      Game: 'Tekken 8',
      Start_Time_UTC: moment.unix(tournament.startAt).utc().format('YYYY-MM-DD HH:mm:ss'),
      Link: `https://start.gg${tournament.url}`
    }));

    const tableData = {
      columns: [
        { title: 'Name', field: 'Name' },
        { title: 'Game', field: 'Game' },
        { title: 'Start Time (UTC)', field: 'Start_Time_UTC' },
        { title: 'Link', field: 'Link', formatter: 'link', formatterParams: { label: 'Visit', target: '_blank' } }
      ],
      data: formattedTournaments
    };

    const table = createTable("#tableElement", tableData);
  })
  .catch(error => {
    console.error('Error fetching tournaments:', error);
  });
