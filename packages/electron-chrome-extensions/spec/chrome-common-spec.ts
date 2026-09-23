import { expect } from 'chai'
import { matchesPattern } from '../src/browser/api/common'

describe('Chrome match patterns', () => {
  it('ignores query parameters when matching the path', () => {
    expect(matchesPattern('https://www.baidu.com/', 'https://www.baidu.com/?wd=sessionbox')).to.equal(true)
    expect(matchesPattern('https://www.baidu.com/*', 'https://www.baidu.com/s?wd=sessionbox')).to.equal(true)
  })
})
