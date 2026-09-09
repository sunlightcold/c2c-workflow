import type { Socket } from 'socket.io-client';

import { shallowRef } from 'vue';

import { useAccessStore } from '@vben/stores';

import { defineStore } from 'pinia';
import { io } from 'socket.io-client';

export const useSocketStore = defineStore('socket', () => {
  const socket = shallowRef<null | Socket>(null);

  const discount = () => {
    socket.value?.disconnect();
  };
  const connect = () => {
    const { accessToken } = useAccessStore();
    discount();
    socket.value = io('', {
      reconnectionDelayMax: 10_000,
      auth: {
        token: accessToken,
      },
    });

    socket.value?.on('connect', () => {
      socket.value?.emit('admin.session.client.ready');
    });

    socket.value?.on('message', (data) => {
      console.warn('message', data);
    });
    socket.value?.on('events', (data) => {
      console.warn('event', data);
    });
    socket.value?.on('exception', (data) => {
      console.warn('event', data);
    });
    socket.value?.on('disconnect', () => {
      console.warn('Disconnected');
    });
  };

  // 添加 $reset 方法，用于重置 store 状态
  function $reset() {
    discount();
    socket.value = null;
  }

  return {
    connect,
    discount,
    socket,
    $reset,
  };
});
