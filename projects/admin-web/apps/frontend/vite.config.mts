import { defineConfig } from '@vben/vite-config';

import AutoImport from 'unplugin-auto-import/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';

const BACKEND_DEV_SERVER = 'http://localhost:3001';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      plugins: [
        AutoImport({
          dirs: ['src/store', 'src/hooks'],
          dts: 'types/auto-imports.d.ts',
          imports: [
            'vue',
            'vue-router',
            'vue-i18n',
            '@vueuse/core',
            'pinia',
            // 其他需要自动导入的库
          ],
        }),
        Components({
          dirs: ['src/components'],
          dts: 'types/components.d.ts',
          resolvers: [
            AntDesignVueResolver({
              importStyle: 'less',
              resolveIcons: true,
            }),
          ],
        }),
      ],
      server: {
        proxy: {
          '/public': {
            changeOrigin: true,
            target: BACKEND_DEV_SERVER,
            ws: false,
          },
          '/socket.io': {
            changeOrigin: true,
            target: BACKEND_DEV_SERVER,
            ws: true,
          },
          '/v1': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/v1/, ''),
            target: `${BACKEND_DEV_SERVER}/v1`,
            ws: false,
          },
        },
      },
    },
  };
});
