# nusviz 3D 驾驶场景可视化 — 可执行任务文档

> **背景**：基于 nusviz 模块输出的 GLB 数据（metadata.glb + messages/*.glb + message_index.json），在 React + TypeScript 项目中实现一个 3D 驾驶场景回放组件。数据包含自车位姿、LiDAR 点云、3D 目标检测框、矢量地图、6 路相机图像五种模态，均以 glTF 2.0 Binary 为容器格式，通过 accessor/bufferView 机制索引二进制数据。
>
> **开发者画像**：熟悉 React + TypeScript 开发，有组件化工程经验；了解 Three.js 基础概念（Scene、Mesh、BufferGeometry、Material）深度使用过 React Three Fiber；熟悉 Zustand 状态管理；具备基本的 3D 数学知识（矩阵、四元数）和计算机图形学背景。

---

## 需求

在浏览器中实现一个可交互的 3D 场景回放组件，能够：
1. 加载并解析 nusviz 格式的 GLB 场景数据
2. 在 3D 场景中渲染矢量地图底图、自车、LiDAR 点云、目标检测框
3. 按时间轴播放/暂停/拖拽回放整个驾驶场景
4. 提供跟随/自由/俯视三种相机模式
5. 在侧面板中展示当前帧 6 路相机图像
6. 支持图层显隐切换和目标框点击选中

---

## 阶段 1：项目初始化与数据解析层 ✅ 已完成

**目标**：搭建项目骨架，实现纯 TypeScript 的 GLB 解析器和场景数据管理器，能正确读取所有模态的原始数据。

- 1.1 创建项目目录结构：
  ```
  src/
  ├── components/
  │   ├── canvas/        # R3F 3D 组件（后续阶段填充）
  │   └── ui/            # 普通 React UI 组件（后续阶段填充）
  ├── data/
  │   ├── GlbParser.ts
  │   ├── SceneDataManager.ts
  │   └── types.ts
  ├── store/
  │   └── sceneStore.ts
  ├── utils/
  │   ├── coordTransform.ts
  │   └── constants.ts
  └── hooks/
      ├── useSceneData.ts
      └── useFrameData.ts
  ```

- 1.2 安装依赖：`react`, `react-dom`, `typescript`, `@react-three/fiber`, `@react-three/drei`, `three`, `@types/three`, `zustand`

- 1.3 在 `data/types.ts` 中定义所有数据层类型接口：
  - `MessageIndex`：对应 message_index.json 的完整结构（messages 数组、log_info、extensions.nuscenes）
  - `MetadataResult`：metadata.glb 解析后的结构化结果，包含 `cameras`（6 个相机的内参 3×3 矩阵 + 外参 translation/rotation）、`mapLayers`（8 个图层名到多边形顶点数组的映射）、`categoryMap`（nameToId 映射）、`sceneInfo`（scene_token、name、description、location）
  - `FrameData`：单帧解析后的结构化结果，包含 `timestamp: number`、`egoPose: { translation: [number,number,number], rotation: [number,number,number,number] }`、`lidar: { positions: Float32Array, intensity: Float32Array }`、`objects: { centers: Float32Array, sizes: Float32Array, rotations: Float32Array, classIds: Uint32Array, trackIds: Uint32Array, count: number }`、`cameraImages: Record<string, string>`（通道名到 Blob URL 的映射）
  - `MapPolygon`：`{ vertices: Float32Array, counts: Uint32Array }`

- 1.4 实现 `data/GlbParser.ts`：
  - `parseGlb(buffer: ArrayBuffer): { json: any, bin: DataView }` — 解析 12 字节 Header（验证 magic=0x46546C67），读取 JSON chunk（chunkType=0x4E4F534A）和 BIN chunk（chunkType=0x004E4942），返回解析后的 JSON 对象和 BIN 的 DataView
  - `readAccessor(json, bin, ref: string): Float32Array | Uint32Array` — 根据 `#/accessors/N` 引用，从 json.accessors 取 componentType 和 type，从 json.bufferViews 取 byteOffset 和 byteLength，从 bin 中切片并构造对应的 TypedArray；componentType 5126 对应 Float32Array，5125 对应 Uint32Array；type VEC3 时 reshape 理解为每 3 个元素一组（返回的仍是扁平 TypedArray，由调用方按 stride 使用）
  - `readImageBlobUrl(json, bin, ref: string): string` — 根据 `#/images/N` 引用，取 bufferView 和 mimeType，从 bin 中切出字节，构造 Blob 并返回 `URL.createObjectURL(blob)`

- 1.5 实现 `data/SceneDataManager.ts`：
  - 构造函数接收 `baseUrl: string`（场景目录 URL，如 `/data/scene-0916/`）
  - `async init()`: fetch message_index.json，解析为 MessageIndex；fetch metadata.glb，调用 GlbParser 解析，提取 cameras、mapLayers（遍历 nuviz.data.map.layers，对每个图层调用 readAccessor 读取 vertices 和 counts）、categoryMap、sceneInfo 并存储
  - `async loadFrame(index: number): FrameData`: fetch 对应帧的 GLB 文件，调用 GlbParser 解析，按路径提取 ego_pose（从 nuviz.data.updates[0].poses["/ego_pose"]）、lidar 点云（从 primitives["/lidar"].points[0]）、objects 标注框（从 primitives["/objects/bounds"].cuboids[0]）、6 路相机图像（遍历 6 个通道路径），组装为 FrameData 返回
  - 内部维护一个 `Map<number, FrameData>` 帧缓存，loadFrame 时先查缓存
  - `prefetch(centerIndex: number, windowSize: number = 5)`: 预加载 [centerIndex, centerIndex+windowSize] 范围内的帧，同时释放超出范围的帧缓存（对其中的 cameraImages Blob URL 调用 `URL.revokeObjectURL`）

- 1.6 实现 `utils/coordTransform.ts`：
  - `wxyzToXyzw(q: [number,number,number,number]): [number,number,number,number]` — 将数据中的 [w,x,y,z] 转为 Three.js Quaternion.set() 接受的 (x,y,z,w) 顺序
  - `categoryColor(classId: number): string` — 根据 CLASS_ID 返回十六进制颜色字符串（car=#3B82F6 蓝、pedestrian=#22C55E 绿、truck=#F97316 橙、bus=#A855F7 紫、bicycle=#EAB308 黄、motorcycle=#EC4899 粉、barrier=#6B7280 灰、traffic_cone=#EF4444 红、trailer=#8B5CF6 蓝紫、construction_vehicle=#D97706 琥珀、unknown=#9CA3AF 浅灰）

- 1.7 实现 `utils/constants.ts`：
  - `CATEGORY_NAMES: Record<number, string>` — ID 到名称映射（1=barrier, 2=bicycle, ..., 10=truck）
  - `MAP_LAYER_COLORS: Record<string, { fill: string, stroke: string }>` — 8 个图层的填充色和边框色（与文档中 visualize_map.py 的配色一致）
  - `CAMERA_CHANNELS: string[]` — 6 个相机通道名数组，按 FRONT、FRONT_LEFT、FRONT_RIGHT、BACK、BACK_LEFT、BACK_RIGHT 顺序

### 阶段 1 验证

编写测试脚本（可以是一个临时的 React 页面或 Node.js 脚本）：
- 用一个真实的 scene 数据目录调用 `SceneDataManager.init()`，打印 metadata 中相机数量（应为 6）、地图图层数量（应为 8 或更少）、帧总数（应与 message_index.json 中 messages 长度一致）
- 调用 `loadFrame(0)` 解析第 0 帧，验证：ego_pose.translation 为 3 个 float；lidar.positions.length 为 3 的倍数且约 90000~120000（即约 30000~40000 点 ×3）；objects.count > 0 且 classIds 中的值均在 0~10 范围内；cameraImages 有 6 个 key，每个 Blob URL 可被 `<img>` 标签正常展示
- 调用 `loadFrame(1)` 验证增量帧同样能正确解析
- 验证 prefetch 后缓存命中（第二次 loadFrame 不发起 fetch）

---

## 阶段 2：静态单帧 3D 渲染 ✅ 已完成

**目标**：在 R3F Canvas 中渲染单帧的所有模态数据（地图 + 自车 + 点云 + 目标框），确认坐标系对齐正确。

- 2.1 实现 `store/sceneStore.ts`（Zustand store）：
  - 状态字段：`currentFrameIndex: number`（初始 0）、`isPlaying: boolean`（初始 false）、`playbackSpeed: number`（初始 1）、`cameraMode: 'follow' | 'free' | 'bev'`（初始 'follow'）、`currentFrameData: FrameData | null`、`selectedTrackId: number | null`、`visibleLayers: Record<string, boolean>`（默认全部 true，key 包括 'pointcloud'、'objects'、以及 8 个地图图层名）
  - Actions：`setFrameIndex(i: number)`、`setFrameData(data: FrameData)`、`play()`、`pause()`、`setSpeed(s: number)`、`setCameraMode(m)`、`setSelectedTrackId(id)`、`toggleLayer(name: string)`

- 2.2 实现 `hooks/useSceneData.ts`：
  - 自定义 hook，接收 `sceneUrl: string`，内部创建 SceneDataManager 实例
  - 返回 `{ metadata: MetadataResult | null, dataManager: SceneDataManager | null, loading: boolean, error: string | null }`
  - 在 useEffect 中调用 `dataManager.init()`，成功后设置 metadata，失败后设置 error

- 2.3 实现 `hooks/useFrameData.ts`：
  - 接收 dataManager 和 currentFrameIndex，当 frameIndex 变化时调用 `dataManager.loadFrame(index)` 并将结果写入 sceneStore 的 currentFrameData
  - 同时触发 `dataManager.prefetch(index)` 预加载后续帧

- 2.4 实现 `components/SceneViewer.tsx`（顶层容器）：
  - 接收 `sceneUrl: string` prop
  - 调用 useSceneData 获取 metadata 和 dataManager
  - 加载中显示 loading 指示器，出错显示 error 信息
  - 加载完成后渲染 R3F `<Canvas>`（配置：`camera={{ position: [0, -50, 80], up: [0, 0, 1], fov: 60 }}`，设置 Z-up）和 UI 组件
  - 用 React Context 将 metadata 和 dataManager 传入子组件

- 2.5 实现 `components/canvas/SceneSetup.tsx`：
  - 渲染 `<ambientLight intensity={0.6} />`、`<directionalLight position={[100, 100, 100]} />`
  - 渲染 `<gridHelper>` 作为地面参考（旋转 90° 使其在 XY 平面，因为场景是 Z-up）
  - 渲染 `<axesHelper args={[10]} />` 用于调试坐标方向

- 2.6 实现 `components/canvas/MapLayer.tsx`：
  - 从 Context 读取 metadata.mapLayers
  - 对每个图层：将 vertices（Float32Array，每 3 个为一点 [x,y,0]）和 counts（Uint32Array，每个多边形的顶点数）转换为 Three.js 几何体。具体做法：遍历 counts 做前缀和切分，对每个多边形构造一个 `ShapeGeometry`（用顶点的 x,y 构造 `THREE.Shape`），然后用 `mergeBufferGeometries` 合并为单个几何体，配合半透明 `MeshBasicMaterial` 渲染填充面，再用 `LineSegments` + `EdgesGeometry` 渲染边框
  - 用 `React.memo` 包裹，依赖项仅为 metadata 引用
  - 从 sceneStore 读取 `visibleLayers` 控制各图层 `visible` 属性

- 2.7 实现 `components/canvas/EgoVehicle.tsx`：
  - 渲染一个简易车辆占位体：用 `<mesh>` + `<boxGeometry args={[2, 4.5, 1.8]} />`（宽2m、长4.5m、高1.8m）+ 蓝色半透明材质，前端用一个小锥体指示车头方向
  - 从 sceneStore 读取 currentFrameData.egoPose，在 useFrame 中更新 mesh 的 position（直接赋值 translation [x,y,z]）和 quaternion（调用 `wxyzToXyzw` 转换后 `quaternion.set(x,y,z,w)`）

- 2.8 实现 `components/canvas/PointCloud.tsx`：
  - 使用 `<points>` + `<bufferGeometry>` + `<pointsMaterial size={0.15} vertexColors />`
  - 用 useRef 持有 geometry 引用
  - 从 sceneStore 读取 currentFrameData.lidar
  - 在 useFrame 中：将 lidar.positions 设为 geometry 的 position attribute（`geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))`），根据每个点的 z 值计算颜色（低→蓝，高→红，使用简单的线性插值映射到 RGB），设为 color attribute，标记 `attributes.position.needsUpdate = true` 和 `attributes.color.needsUpdate = true`
  - 当帧数据的点数与上一帧不同时，需要重建 attribute（因为 BufferAttribute 的长度不可变）；点数相同时仅更新 array 引用
  - 从 sceneStore 读取 visibleLayers.pointcloud 控制 visible

- 2.9 实现 `components/canvas/ObjectBoxes.tsx`：
  - 使用 `THREE.InstancedMesh`：创建一个 `<instancedMesh>` 配合 `<boxGeometry args={[1,1,1]} />` 和 `<meshBasicMaterial transparent opacity={0.3} />`，instance count 设为当前帧 objects.count
  - 用 useRef 持有 instancedMesh 引用
  - 在 useFrame 中遍历所有目标：为每个目标构造变换矩阵（position 来自 centers[i*3..i*3+2]，scale 来自 sizes[i*3..i*3+2]，rotation 来自 rotations[i*4..i*4+3] 经 wxyzToXyzw 转换），调用 `instancedMesh.setMatrixAt(i, matrix)` 和 `instancedMesh.setColorAt(i, categoryColor(classIds[i]))`
  - 更新后设置 `instancedMesh.instanceMatrix.needsUpdate = true` 和 `instancedMesh.instanceColor.needsUpdate = true`
  - 当目标数量变化时重建 InstancedMesh（通过更新 React key 触发）
  - 额外渲染线框：对同一组 instance 数据，再渲染一组 `<lineSegments>` 表示每个框的边缘（用 EdgesGeometry 基于 BoxGeometry 生成线段几何体，同样用 InstancedMesh 或逐个 Line 渲染——MVP 阶段可先用 InstancedMesh 的半透明填充替代纯线框）

- 2.10 在 SceneViewer 中组装：加载第 0 帧数据，渲染 Canvas 内的所有 canvas/ 组件，暂不实现播放控制（手动在代码中设定 currentFrameIndex = 0）

### 阶段 2 验证

- 启动项目，在浏览器中打开 SceneViewer 页面
- 确认地图底图渲染正确：drivable_area 和 road_segment 等图层应形成连续的道路形状，无明显的坐标偏移或翻转
- 确认自车位置位于地图道路上（而非地图外或地下）
- 确认点云分布在自车周围（约 75m 半径内），点云的高度分布合理（地面点 z≈0，建筑/树木 z 较高）
- 确认目标框出现在点云中可辨识的物体位置，框的尺寸与点云簇大致匹配（car 约 2×4.5×1.8m）
- 确认坐标轴方向：X 轴（红）指向东、Y 轴（绿）指向北、Z 轴（蓝）指向上
- 用浏览器开发者工具确认无 WebGL 错误和内存泄漏警告

---

## 阶段 3：时间轴播放与帧切换 ✅ 已完成

**目标**：实现完整的时间轴播放系统，能流畅地逐帧回放整个场景。

- 3.1 实现 `components/canvas/FrameSynchronizer.tsx`：
  - 不渲染任何可见元素（return null）
  - 在 useFrame 回调中：通过 `sceneStore.getState()` 读取 isPlaying、playbackSpeed、currentFrameIndex（避免 re-render）
  - 内部维护 `accumulatorRef = useRef(0)`
  - 当 isPlaying 为 true 时：accumulator += delta * playbackSpeed；当 accumulator >= 0.5（nuScenes 帧间隔约 0.5 秒）时：accumulator -= 0.5，frameIndex += 1
  - frameIndex 不超过总帧数 - 1，到达末尾时自动暂停
  - 调用 sceneStore.setFrameIndex(newIndex) 更新帧号
  - seekTo 时清零 accumulator

- 3.2 更新 `hooks/useFrameData.ts`：
  - 监听 sceneStore 的 currentFrameIndex 变化
  - 变化时调用 `dataManager.loadFrame(index)`，完成后调用 `sceneStore.setFrameData(data)`
  - 同步调用 `dataManager.prefetch(index, 5)` 预加载后续 5 帧
  - 处理帧加载失败：在 console 打印警告，frameData 保持上一帧不变

- 3.3 实现 `components/ui/TimelineBar.tsx`：
  - 包含：播放/暂停按钮（toggle sceneStore.isPlaying）、进度滑块（input type=range，min=0，max=totalFrames-1，value=currentFrameIndex，onChange 时调用 sceneStore.setFrameIndex 并 pause）、倍速按钮组（0.5x / 1x / 2x / 4x，调用 sceneStore.setSpeed）、帧号显示（`帧 12/40`）、时间戳显示（格式化为 `mm:ss.s`）
  - 从 sceneStore 订阅 currentFrameIndex、isPlaying、playbackSpeed

- 3.4 实现 `components/canvas/EgoTrajectory.tsx`：
  - 从 dataManager 中收集所有已加载帧的 ego_pose.translation 构建轨迹点数组
  - 用 `<line>` + `<bufferGeometry>` + `<lineBasicMaterial color="#FF6B35" linewidth={2} />` 渲染轨迹线
  - 仅渲染从第 0 帧到当前帧的轨迹段（随播放推进而增长）
  - 在起点绘制绿色小球、当前位置绘制橙色小球

- 3.5 确保所有 canvas/ 组件的帧更新逻辑在 useFrame 中通过 `getState()` 读取数据，而非通过 Zustand selector 触发 re-render。UI 组件（TimelineBar）通过 selector 订阅以驱动 React re-render 更新文字和滑块位置。

### 阶段 3 验证

- 点击播放按钮，场景应以 1x 速度流畅回放（每约 0.5 秒切换一帧），自车沿轨迹移动，点云和目标框随帧更新
- 切换到 2x 和 4x 速度，帧切换频率应相应加快
- 拖拽进度滑块到任意位置，场景应跳转到对应帧并暂停
- 回放到最后一帧后应自动暂停，帧号显示为最大值
- 在 Chrome DevTools Network 面板中确认：播放时 GLB 文件按序加载，且前方帧有预加载行为（prefetch 提前发起 fetch）
- 在 Performance 面板中确认帧率稳定在 30fps 以上，无明显掉帧

---

## 阶段 4：相机控制系统 ✅ 已完成

**目标**：实现三种相机模式的切换，并保证视角转换平滑。

- 4.1 实现 `components/canvas/CameraController.tsx`：
  - 引入 `@react-three/drei` 的 `<OrbitControls>`，通过 ref 持有控制器实例
  - 从 sceneStore 读取 cameraMode 和 currentFrameData.egoPose
  - **follow 模式**：在 useFrame 中，将 OrbitControls 的 target 设为自车 translation（平滑插值：`target.lerp(egoPos, 0.1)`），相机位置保持在自车后上方（相对偏移 [0, -30, 40] 经自车旋转变换后加到自车位置上），同样做 lerp 平滑。用户可通过鼠标旋转/缩放微调视角，但每帧 target 都会被拉回自车位置
  - **free 模式**：不更新 OrbitControls 的 target 和相机位置，完全由用户鼠标控制。切换到 free 模式时保持当前相机位置不变
  - **bev 模式**：在 useFrame 中，将相机位置设为 [ego.x, ego.y, 150]（自车正上方 150m），target 设为 [ego.x, ego.y, 0]，up 向量设为 [0, 1, 0]（北方朝上）。禁用 OrbitControls 的旋转，仅允许缩放
  - 模式切换时使用 lerp 过渡（约 0.5 秒内平滑移动到目标位置），避免相机跳变

- 4.2 实现模式切换 UI：在 SceneViewer 中添加三个按钮（跟随 / 自由 / 俯视），点击时调用 sceneStore.setCameraMode

### 阶段 4 验证

- 默认 follow 模式下，播放时相机自动跟随自车移动，视角始终能看到自车和前方道路
- 鼠标拖拽旋转视角后松开，相机仍跟随自车但保持用户调整的相对角度
- 切换到 free 模式，相机静止不动，播放时场景内容在固定视角下变化
- 切换到 bev 模式，视角立刻（平滑过渡）变为正上方俯视，能看到自车在地图上的位置和周围目标
- 从 bev 切回 follow 模式，相机平滑回到跟随位置，无闪跳

---

## 阶段 5：相机图像面板与交互功能 ✅ 已完成

**目标**：补全 2D UI 部分和 3D 交互功能。

- 5.1 实现 `components/ui/CameraPanel.tsx`：
  - 从 sceneStore 订阅 currentFrameData.cameraImages
  - 以 2 行 × 3 列网格布局展示 6 路相机图像：第一行 FRONT_LEFT / FRONT / FRONT_RIGHT，第二行 BACK_LEFT / BACK / BACK_RIGHT
  - 每张图片用 `<img src={blobUrl} />` 渲染，宽度自适应容器
  - 每张图片下方标注通道名
  - 点击任一图片时弹出放大查看（用简单的 modal overlay，展示原始 1600×900 分辨率）

- 5.2 实现 `components/ui/LayerToggle.tsx`：
  - 渲染一组 checkbox，每项对应 sceneStore.visibleLayers 中的一个 key
  - 分为两组："数据模态"（点云、目标框）和"地图图层"（8 个图层）
  - 勾选/取消勾选时调用 sceneStore.toggleLayer
  - 每个 checkbox 旁显示对应颜色色块（目标框用类别颜色，地图图层用 fill 颜色）

- 5.3 在 ObjectBoxes 中添加目标选中交互：
  - 给 instancedMesh 添加 `onPointerDown` 事件回调
  - R3F 的事件系统会自动做 raycasting，回调参数中包含 `instanceId`
  - 通过 instanceId 索引当前帧的 trackIds 数组，获取 TRACK_ID
  - 调用 sceneStore.setSelectedTrackId(trackId)
  - 选中的目标框渲染为高亮色（如白色边框、不透明度提高）
  - 点击空白区域时取消选中

- 5.4 实现 `components/ui/InfoOverlay.tsx`：
  - 半透明叠加在 Canvas 左上角
  - 显示：当前帧号/总帧数、时间戳、当前帧点云点数、当前帧目标数
  - 当有选中目标时额外显示：TRACK_ID、类别名称（通过 CLASS_ID 查 CATEGORY_NAMES）、框中心坐标、框尺寸

- 5.5 组装最终布局：SceneViewer 采用左右分栏布局，左侧为 3D Canvas（占 70% 宽度）+ 底部 TimelineBar，右侧为 CameraPanel + LayerToggle。InfoOverlay 叠加在 Canvas 左上角。相机模式按钮放在 Canvas 右上角。

### 阶段 5 验证

- 播放时 CameraPanel 中 6 路图像随帧同步更新，图像内容与 3D 场景中自车视角方向一致（FRONT 图像应显示自车前方的场景）
- 点击某张图像能弹出放大查看，关闭后恢复正常
- 取消勾选"点云"，3D 场景中点云消失；重新勾选后恢复。地图各图层同理
- 点击 3D 场景中某个目标框，该框高亮，InfoOverlay 显示其信息；点击空白处高亮取消
- 整体布局在 1920×1080 和 1440×900 分辨率下均能正常显示，无溢出

---

## 阶段 6：性能优化与资源清理

**目标**：确保组件在完整场景回放中无内存泄漏、帧率稳定、资源正确释放。

- 6.1 点云渲染优化：
  - 当点云点数超过 20000 时，做等间隔降采样到 20000 点（每隔 N 个点取一个，N = Math.ceil(totalPoints / 20000)）
  - 降采样逻辑放在 SceneDataManager.loadFrame 中，对 positions 和 intensity 同步降采样
  - 复用 BufferAttribute：在 PointCloud 组件中预分配一个固定大小（20000 × 3）的 Float32Array 作为 position attribute 的 buffer，每帧仅 copy 数据进去并更新 `drawRange.count`，避免每帧创建新的 BufferAttribute

- 6.2 InstancedMesh 优化：
  - 预分配 instance count 为场景中最大目标数（可在 init 时扫描或设一个上界如 100），每帧仅更新实际数量的 matrix 并设置 `instancedMesh.count = actualCount`
  - 避免因目标数量变化而重建 InstancedMesh

- 6.3 资源释放：
  - 在 SceneDataManager.prefetch 中，当释放帧缓存时，遍历 FrameData.cameraImages 调用 `URL.revokeObjectURL`
  - 在 MapLayer 组件的 useEffect cleanup 中调用 `geometry.dispose()` 和 `material.dispose()`
  - 在 PointCloud 和 ObjectBoxes 组件的 useEffect cleanup 中同样 dispose geometry 和 material
  - 在 SceneViewer 卸载时调用 `dataManager.destroy()` 释放所有帧缓存和 Blob URL

- 6.4 React re-render 审查：
  - 确认所有 canvas/ 组件的帧更新逻辑在 useFrame 中通过 `sceneStore.getState()` 完成，而非触发 React re-render
  - 使用 React DevTools Profiler 确认播放过程中 canvas/ 组件不发生 re-render（除 InstancedMesh 因 key 变化的情况外，该情况在 6.2 中已消除）
  - UI 组件的 re-render 应仅由其订阅的 store 字段变化触发（TimelineBar 订阅 frameIndex、isPlaying、speed；CameraPanel 订阅 frameData.cameraImages）

- 6.5 集成 `@react-three/drei` 的 `<Stats />` 组件，在开发模式下显示 FPS 面板

### 阶段 6 验证

- 完整回放一个 40 帧场景 3 遍（约 60 秒 × 3），监控 Chrome DevTools Memory 面板，堆内存不应持续增长（允许帧缓存窗口范围内的稳定占用）
- 播放过程中 FPS 面板显示稳定 ≥ 30fps（目标 60fps）
- 回放完成后手动触发 SceneViewer 卸载（如切换路由），确认 Memory 面板中 JS heap 回落到初始水平附近
- React DevTools Profiler 中确认播放过程无非预期的组件 re-render