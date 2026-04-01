// Re-export the app store hook so feature code can import from '@/shared/lib/hooks'
// rather than reaching into the store file directly.
export { useAppStore } from './store'
