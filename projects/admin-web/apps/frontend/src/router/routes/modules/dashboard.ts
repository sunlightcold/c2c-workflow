import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    alias: ['/dashboard', '/dashboard/workspace'],
    component: () => import('#/views/dashboard/workspace/index.vue'),
    meta: {
      affixTab: true,
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: $t('page.dashboard.workspace'),
    },
    name: 'Workspace',
    path: '/workspace',
  },
];

export default routes;
