// Built-in fetch

async function test() {
  const query = `
    query ($ids: [Int]) {
      Page {
        media(id_in: $ids, type: ANIME) {
          id
          status
          nextAiringEpisode {
            airingAt
            timeUntilAiring
            episode
          }
        }
      }
    }
  `;

  const url = 'https://graphql.anilist.co';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { ids: [21, 16498] } })
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
