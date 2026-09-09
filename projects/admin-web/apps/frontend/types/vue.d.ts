import type { Component, Directive } from 'vue';

import { AccessCode } from './access-code';

declare module 'vue' {
  export interface ComponentCustomProperties extends Component {
    vAccess: Directive<any, AccessCode | AccessCode[]>;
  }
}

export {};
