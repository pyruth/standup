import type { StandUpApi } from '../shared/types';

declare global {
  interface Window {
    standUp: StandUpApi;
  }
}

export {};
