import styles from './Header.module.css'

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div>
          <p className={styles.kicker}>模板项目</p>
          <p className={styles.brand}>React Feature 架构</p>
        </div>
      </div>
    </header>
  )
}
