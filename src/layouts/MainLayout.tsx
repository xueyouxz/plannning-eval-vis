import { Outlet } from 'react-router-dom'
import { Header } from './components/Header'
import styles from './MainLayout.module.css'

export function MainLayout() {
  return (
    <div className={styles.shell}>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
