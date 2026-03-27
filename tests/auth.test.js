const { requireAuth } = require('../src/middleware/auth');

function makeReq(authHeader) {
  return { headers: { authorization: authHeader } };
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('requireAuth', () => {
  const VALID_TOKEN = 'my-secret-token';

  beforeEach(() => {
    process.env.ADMIN_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  test('calls next() with valid token', () => {
    const next = jest.fn();
    requireAuth(makeReq(`Bearer ${VALID_TOKEN}`), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 with wrong token', () => {
    const next = jest.fn();
    const res = makeRes();
    requireAuth(makeReq('Bearer wrong-token'), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 with no Authorization header', () => {
    const next = jest.fn();
    const res = makeRes();
    requireAuth(makeReq(undefined), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 503 when ADMIN_TOKEN is not set', () => {
    delete process.env.ADMIN_TOKEN;
    const next = jest.fn();
    const res = makeRes();
    requireAuth(makeReq(`Bearer ${VALID_TOKEN}`), res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});
