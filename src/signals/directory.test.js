const { listBusinessIds } = require('./directory');

describe('listBusinessIds', () => {
  it('returns an empty array for no signals', () => {
    expect(listBusinessIds([])).toEqual([]);
  });
});
