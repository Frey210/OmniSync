// Built-in fetch

async function test() {
  const query = `
    query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        id
        title { romaji english native }
        coverImage { large }
        episodes
        chapters
      }
    }
  `;

  const url = 'https://graphql.anilist.co';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { search: "everyones darling has a secret", type: "MANGA" } })
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
