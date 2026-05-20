const { isMobileNumber, searchBusinesses, getPlaceDetails } = require('../src/services/scraper');

// Mock the Google Maps client BEFORE requiring the module under test
jest.mock('@googlemaps/google-maps-services-js', () => {
  const textSearchMock = jest.fn();
  const placeDetailsMock = jest.fn();
  return {
    Client: jest.fn().mockImplementation(() => ({
      textSearch: textSearchMock,
      placeDetails: placeDetailsMock
    })),
    __mocks: { textSearchMock, placeDetailsMock }
  };
});

const { __mocks } = require('@googlemaps/google-maps-services-js');
const { textSearchMock, placeDetailsMock } = __mocks;

beforeEach(() => {
  textSearchMock.mockReset();
  placeDetailsMock.mockReset();
});

describe('isMobileNumber (Indonesia)', () => {
  test('returns true for 08 prefix', () => {
    expect(isMobileNumber('08123456789')).toBe(true);
  });

  test('returns true for +628 prefix', () => {
    expect(isMobileNumber('+6281234567890')).toBe(true);
  });

  test('returns true for 00628 prefix', () => {
    expect(isMobileNumber('00628123456789')).toBe(true);
  });

  test('returns true for empty or null phone (do not skip phoneless)', () => {
    expect(isMobileNumber('')).toBe(true);
    expect(isMobileNumber(null)).toBe(true);
    expect(isMobileNumber(undefined)).toBe(true);
  });

  test('returns false for Jakarta landline (021 prefix)', () => {
    expect(isMobileNumber('02112345678')).toBe(false);
  });

  test('returns false for international landline', () => {
    expect(isMobileNumber('+12025550100')).toBe(false);
  });

  test('strips spaces and dashes before matching', () => {
    expect(isMobileNumber('+62 812-3456-7890')).toBe(true);
  });
});

describe('isMobileNumber (other countries)', () => {
  test('keeps any number when country is not Indonesia (filter is ID-only)', () => {
    // UAE landline + mobile both kept so non-Indonesia runs are not silently emptied
    expect(isMobileNumber('+97142223333', 'United Arab Emirates')).toBe(true);
    expect(isMobileNumber('+971501234567', 'United Arab Emirates')).toBe(true);
    expect(isMobileNumber('+12025550100', 'United States')).toBe(true);
  });

  test('still keeps phoneless leads regardless of country', () => {
    expect(isMobileNumber('', 'United Arab Emirates')).toBe(true);
    expect(isMobileNumber(null, 'Nigeria')).toBe(true);
  });

  test('still applies the strict filter when country is Indonesia', () => {
    expect(isMobileNumber('02112345678', 'Indonesia')).toBe(false);
    expect(isMobileNumber('08123456789', 'Indonesia')).toBe(true);
  });
});

describe('searchBusinesses', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('builds query as "${category} in ${city}" and returns place_id/name/rating', async () => {
    textSearchMock.mockResolvedValueOnce({
      data: {
        results: [
          { place_id: 'p1', name: 'Salon One', rating: 4.5 },
          { place_id: 'p2', name: 'Salon Two', rating: 4.2 }
        ],
        next_page_token: undefined
      }
    });
    const results = await searchBusinesses('KEY', 'Jakarta', 'salon');
    expect(textSearchMock).toHaveBeenCalledWith({
      params: { query: 'salon in Jakarta', key: 'KEY' }
    });
    expect(results).toEqual([
      { place_id: 'p1', name: 'Salon One', rating: 4.5 },
      { place_id: 'p2', name: 'Salon Two', rating: 4.2 }
    ]);
  });

  test('follows pagination up to 3 pages', async () => {
    textSearchMock
      .mockResolvedValueOnce({ data: { results: [{ place_id: 'p1', name: 'A', rating: 4 }], next_page_token: 't1' } })
      .mockResolvedValueOnce({ data: { results: [{ place_id: 'p2', name: 'B', rating: 4 }], next_page_token: 't2' } })
      .mockResolvedValueOnce({ data: { results: [{ place_id: 'p3', name: 'C', rating: 4 }], next_page_token: 't3' } });
    const promise = searchBusinesses('KEY', 'Bali', 'spa');
    await jest.runAllTimersAsync();
    const results = await promise;
    expect(textSearchMock).toHaveBeenCalledTimes(3);
    expect(results.map(r => r.place_id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('stops paginating when next_page_token is absent', async () => {
    textSearchMock.mockResolvedValueOnce({
      data: { results: [{ place_id: 'p1', name: 'A', rating: 4 }], next_page_token: undefined }
    });
    const results = await searchBusinesses('KEY', 'Surabaya', 'gym');
    expect(textSearchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });
});

describe('getPlaceDetails', () => {
  test('returns normalised business object', async () => {
    placeDetailsMock.mockResolvedValueOnce({
      data: {
        result: {
          place_id: 'p1',
          name: 'Salon One',
          formatted_address: '123 Main St, Jakarta',
          formatted_phone_number: '+62 812 3456 7890',
          website: 'https://salon-one.example',
          rating: 4.5,
          user_ratings_total: 124,
          url: 'https://maps.google.com/?cid=1'
        }
      }
    });
    const details = await getPlaceDetails('KEY', 'p1');
    expect(placeDetailsMock).toHaveBeenCalledWith({
      params: {
        place_id: 'p1',
        key: 'KEY',
        fields: ['name', 'formatted_address', 'formatted_phone_number', 'website', 'rating', 'user_ratings_total', 'place_id', 'url']
      }
    });
    expect(details).toEqual({
      placeId: 'p1',
      name: 'Salon One',
      address: '123 Main St, Jakarta',
      phone: '+62 812 3456 7890',
      website: 'https://salon-one.example',
      rating: 4.5,
      totalReviews: 124,
      mapsUrl: 'https://maps.google.com/?cid=1'
    });
  });

  test('handles missing optional fields gracefully', async () => {
    placeDetailsMock.mockResolvedValueOnce({
      data: {
        result: {
          place_id: 'p2',
          name: 'Spa Two'
        }
      }
    });
    const details = await getPlaceDetails('KEY', 'p2');
    expect(details).toEqual({
      placeId: 'p2',
      name: 'Spa Two',
      address: null,
      phone: null,
      website: null,
      rating: null,
      totalReviews: null,
      mapsUrl: null
    });
  });
});
