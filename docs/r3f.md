# R3F 组件编写考虑的问题以及遵循的基本原则
## 写 R3F 组件时，自问以下问题：

1. 在useFrame里访问的对象，是在哪里创建/初始化的？
2. 如果是在useEffect里初始化的，第一帧useFrame跑的时候它存在吗？

3. 所有as SomeType的类型断言，对应的值在运行时真的不可能是undefined吗？

4. Three.js 对象的创建是否可以用useMemo提前到渲染阶段？

## 原则 1：凡是在 useFrame 里读取的 Three.js 对象，必须在 useFrame 内懒初始化
```javascript
// ✅ 正确模式：懒初始化 flag + useFrame 内检查
const initialised = useRef(false)
useFrame(() => {
  const geo = geoRef.current
  if (!geo) return  // ref 还没绑定，跳过
  if (!initialised.current) {
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3))
    initialised.current = true
  }
  // 现在可以安全访问
  const attr = geo.getAttribute('position') as THREE.BufferAttribute
  attr.needsUpdate = true
})
```
## 原则 2：访问 attribute 前加防御性 null check，而不是类型断言
```javascript
// ❌ 类型断言掩盖了运行时 undefined
const attr = geo.getAttribute('position') as THREE.BufferAttribute
attr.needsUpdate = true  // 如果 attr 是 undefined，直接崩
// ✅ 防御性访问
const attr = geo.getAttribute('position')
if (attr instanceof THREE.BufferAttribute) {
  attr.needsUpdate = true
}
```
## 原则 3：useEffect 只做 React 副作用（事件监听、订阅、DOM 操作），不做 Three.js 对象的状态初始化
```javascript
// useEffect 适合做的事
useEffect(() => {
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
// Three.js 对象初始化 → 移到 useFrame 懒初始化 或 useMemo
const geometry = useMemo(() => {
  const geo = new THREE.BufferGeometry()
  const attr = new THREE.BufferAttribute(buf, 3)
  attr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', attr)
  return geo
}, [])
```
## 原则 4：用 useMemo 替代 useEffect + useRef 组合来创建 Three.js 对象

useMemo 在渲染阶段同步执行，保证在第一帧 useFrame 之前完成：
```javascript
// ✅ useMemo 保证同步创建，第一帧前就绪
const lineGeo = useMemo(() => {
  const geo = new THREE.BufferGeometry()
  const attr = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)
  attr.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', attr)
  geo.setDrawRange(0, 0)
  return geo
}, [])
// 直接用 primitive 传入，不需要 ref + useEffect
return <primitive object={lineGeo} attach="geometry" />
```

