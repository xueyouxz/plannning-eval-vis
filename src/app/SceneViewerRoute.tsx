import { Suspense } from 'react'
import { useParams } from 'react-router-dom'
import SceneViewer from '@/features/scene-viewer/components/SceneViewer'

export default function SceneViewerRoute() {
  const { sceneName = 'scene-0916' } = useParams<{ sceneName: string }>()
  const sceneUrl = `/data/scene-viewer/${sceneName}/`
  return (
    <div style={{ width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Suspense fallback={null}>
        <SceneViewer sceneUrl={sceneUrl} />
      </Suspense>
    </div>
  )
}
