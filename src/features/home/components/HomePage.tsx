import MultiSceneTsneMap from './MultiSceneTsneMap'
import styles from './HomePage.module.css'

export default function HomePage() {
  return (
    <section className={styles.page}>
      <MultiSceneTsneMap />
    </section>
  )
}
