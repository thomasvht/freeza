import config from '../../ngsw-config.json';

describe('ngsw-config.json', () => {
  it('always asks the network for navigations so Access can run its login flow', () => {
    expect(config.navigationRequestStrategy).toBe('freshness');
  });

  it('keeps Access callbacks, the API and files out of navigation handling', () => {
    expect(config.navigationUrls).toEqual([
      '/**',
      '!/**/*.*',
      '!/**/*__*',
      '!/**/*__*/**',
      '!/cdn-cgi/**',
      '!/api/**',
    ]);
  });
});
