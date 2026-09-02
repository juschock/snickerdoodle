export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const healthHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

export function GET() {
  return Response.json(
    { status: 'ok', service: 'snickerdoodle' },
    { status: 200, headers: healthHeaders }
  );
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
