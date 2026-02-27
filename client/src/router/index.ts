import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'intro',
      component: () => import('@/views/IntroPage.vue')
    },
    {
      path: '/menu',
      name: 'menu',
      component: () => import('@/views/MenuPage.vue')
    },
    {
      path: '/friends',
      name: 'friends',
      component: () => import('@/views/FriendsPage.vue')
    },
    {
      path: '/room/:code?',
      name: 'room',
      component: () => import('@/views/RoomPage.vue')
    },
    {
      path: '/room/game',
      name: 'game',
      component: () => import('@/views/GamePage.vue')
    },
    {
      path: '/room/results',
      name: 'round-results',
      component: () => import('@/views/RoundResultsPage.vue')
    },
    {
      path: '/room/final',
      name: 'final-results',
      component: () => import('@/views/FinalResultsPage.vue')
    }
  ]
})

export default router
