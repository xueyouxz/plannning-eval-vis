import { Suspense, lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'

const HomePage = lazy(() => import('@/features/home/components/HomePage'))
const SceneViewerDebugPage = lazy(() => import('@/features/scene-viewer/components/SceneViewerDebugPage'))
const CameraBboxTest = lazy(
  () => import('../../tests/features/scene-viewer/programs/CameraBBoxProjectionTestPage')
)
const SceneViewerRoute = lazy(() => import('./SceneViewerRoute'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <HomePage />
          </Suspense>
        )
      },
      {
        path: 'scene-viewer',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <SceneViewerDebugPage />
          </Suspense>
        )
      },
      {
        path: 'scene-viewer/camera-bbox-test',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <CameraBboxTest />
          </Suspense>
        )
      }
    ]
  },
  {
    path: '/scene-viewer/scene/:sceneName',
    element: (
      <Suspense fallback={<div>Loading...</div>}>
        <SceneViewerRoute />
      </Suspense>
    )
  }
])
