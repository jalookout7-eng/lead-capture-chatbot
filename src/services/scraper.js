const { Client } = require('@googlemaps/google-maps-services-js');

const MOBILE_REGEX = /^(\+?62|0062|0)[89][0-9]{7,11}$/;
const PAGE_DELAY_MS = 2000;
const MAX_PAGES = 3;
const PLACE_FIELDS = [
  'name', 'formatted_address', 'formatted_phone_number',
  'website', 'rating', 'user_ratings_total', 'place_id', 'url'
];

const client = new Client({});

function isMobileNumber(phone) {
  if (!phone) return true;
  const cleaned = String(phone).replace(/[\s\-]/g, '');
  return MOBILE_REGEX.test(cleaned);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchBusinesses(apiKey, city, category) {
  const query = `${category} in ${city}`;
  const results = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = pageToken
      ? { query, key: apiKey, pagetoken: pageToken }
      : { query, key: apiKey };
    const response = await client.textSearch({ params });
    const data = response.data || {};
    for (const r of (data.results || [])) {
      results.push({ place_id: r.place_id, name: r.name, rating: r.rating });
    }
    pageToken = data.next_page_token;
    if (!pageToken) break;
    await delay(PAGE_DELAY_MS);
  }
  return results;
}

async function getPlaceDetails(apiKey, placeId) {
  const response = await client.placeDetails({
    params: { place_id: placeId, key: apiKey, fields: PLACE_FIELDS }
  });
  const r = (response.data && response.data.result) || {};
  return {
    placeId: r.place_id ?? placeId,
    name: r.name ?? null,
    address: r.formatted_address ?? null,
    phone: r.formatted_phone_number ?? null,
    website: r.website ?? null,
    rating: r.rating ?? null,
    totalReviews: r.user_ratings_total ?? null,
    mapsUrl: r.url ?? null
  };
}

module.exports = { isMobileNumber, searchBusinesses, getPlaceDetails };
