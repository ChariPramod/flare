// Synthetic upstreams for the isolated ingress test. Never load deployment settings.
import { createServer } from 'node:http';

for (const [port, service] of [
  [3000, 'web'],
  [4000, 'api'],
  [3002, 'ws'],
]) {
  createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        service,
        path: req.url,
        client: req.headers['x-flare-client-ip'],
        forwarded: req.headers['x-forwarded-for'],
      }),
    );
  }).listen(port, '0.0.0.0');
}
