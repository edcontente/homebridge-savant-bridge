import axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';

export interface SavantScene {
  id: string;
  name: string;
}

export class SavantClient {
  private readonly http: AxiosInstance;
  private readonly api: AxiosInstance;

  // Serial command queue (one at a time to protect the bridge)
  private readonly queue: Array<{ cmd: string; resolve: (v: string) => void; reject: (e: unknown) => void }> = [];
  private busy = false;

  constructor(
    private readonly log: Logger,
    private readonly host: string,
    private readonly scliPort: number,
    private readonly apiPort: number,
  ) {
    this.http = axios.create({ baseURL: `http://${host}:${scliPort}`, timeout: 10000 });
    this.api = axios.create({ baseURL: `http://${host}:${apiPort}`, timeout: 10000 });
  }

  // ── sclibridge (porta 12000) ──────────────────────────────────────

  async sendCommand(cmd: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      this.drain();
    });
  }

  private async drain() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    while (this.queue.length) {
      const { cmd, resolve, reject } = this.queue.shift()!;
      try {
        const r = await this.http.get(`/${encodeURIComponent(cmd)}`, { responseType: 'text' });
        resolve((r.data as string).trim());
      } catch (e) {
        this.log.error(`scli failed: ${cmd} – ${e instanceof Error ? e.message : e}`);
        reject(e);
      }
    }
    this.busy = false;
  }

  async serviceRequest(csv: string): Promise<boolean> {
    try {
      await this.sendCommand(`servicerequest ${csv.split(',').join(' ')}`);
      return true;
    } catch {
      return false;
    }
  }

  async readState(name: string): Promise<string> {
    return this.sendCommand(`readstate ${name}`);
  }

  async listZones(): Promise<string[]> {
    try {
      const r = await this.sendCommand('userzones');
      return r.split('\n').map(z => z.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ── Savant OpenAPI (porta 3060) ───────────────────────────────────

  async getScenes(): Promise<SavantScene[]> {
    try {
      const r = await this.api.get('/config/v1/scenes');
      return (r.data as Array<{ id: string; name?: string; alias?: string }>)
        .filter(s => s.id)
        .map(s => ({ id: s.id, name: s.name || s.alias || `Scene ${s.id}` }));
    } catch (e) {
      this.log.warn(`Scenes fetch failed: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  async activateScene(id: string): Promise<boolean> {
    try {
      await this.api.post(`/control/v1/scenes/${id}/apply`);
      return true;
    } catch (e) {
      this.log.error(`Scene ${id} failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  // ── Connectivity test ─────────────────────────────────────────────

  async testConnection(): Promise<{ scli: boolean; api: boolean }> {
    let scli = false;
    let apiOk = false;

    try {
      await this.sendCommand('userzones');
      scli = true;
      this.log.info(`sclibridge OK @ ${this.host}:${this.scliPort}`);
    } catch {
      this.log.warn(`sclibridge FAIL @ ${this.host}:${this.scliPort}`);
    }

    try {
      await this.api.get('/config/v1/scenes');
      apiOk = true;
      this.log.info(`Savant API OK @ ${this.host}:${this.apiPort}`);
    } catch {
      this.log.warn(`Savant API FAIL @ ${this.host}:${this.apiPort}`);
    }

    return { scli, api: apiOk };
  }
}
