// Redis TIME supplies the shared clock; refill and consume happen atomically on one key.
export const tokenBucketScript = `
local time=redis.call('TIME')
local now=tonumber(time[1])*1000+tonumber(time[2])/1000
local rate=tonumber(ARGV[1])
local burst=tonumber(ARGV[2])
local state=redis.call('HMGET',KEYS[1],'tokens','at')
local previous=tonumber(state[2]) or now
now=math.max(now,previous)
local tokens=math.min(burst,(tonumber(state[1]) or burst)+math.max(0,now-previous)*rate/1000)
local allowed=0
if tokens>=1 then tokens=tokens-1;allowed=1 end
redis.call('HSET',KEYS[1],'tokens',tokens,'at',now)
redis.call('PEXPIRE',KEYS[1],math.ceil(burst/rate*1000)+1000)
return {allowed,math.floor(tokens),math.ceil(math.max(0,1-tokens)/rate*1000),math.ceil((burst-tokens)/rate*1000)}
`;
export interface LimiterRedis {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}
export async function tokenBucket(redis: LimiterRedis, key: string, rate: number, burst: number) {
  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > 10000 ||
    !Number.isInteger(burst) ||
    burst < 1 ||
    burst > 10000
  )
    throw new Error('Invalid rate limit configuration');
  const result = (await redis.eval(
    tokenBucketScript,
    1,
    `flare:limit:${key}`,
    rate,
    burst,
  )) as number[];
  if (!Array.isArray(result) || result.length !== 4 || result.some((n) => !Number.isFinite(n)))
    throw new Error('Invalid limiter response');
  return {
    allowed: result[0] === 1,
    remaining: result[1]!,
    retryAfter: Math.max(1, Math.ceil(result[2]! / 1000)),
    reset: Math.max(1, Math.ceil(result[3]! / 1000)),
    limit: burst,
  };
}
