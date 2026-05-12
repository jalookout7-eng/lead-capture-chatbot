const MOBILE_REGEX = /^(\+?62|0062|0)[89][0-9]{7,11}$/;

function isMobileNumber(phone) {
  if (!phone) return true;
  const cleaned = String(phone).replace(/[\s\-]/g, '');
  return MOBILE_REGEX.test(cleaned);
}

module.exports = { isMobileNumber };
