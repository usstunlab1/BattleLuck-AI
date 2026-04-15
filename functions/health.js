export async function GET() {
  return {
    status: 'healthy',
    service: 'BattleLuck Battle Intelligence',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
  };
}
