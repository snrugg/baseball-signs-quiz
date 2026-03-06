import { ref, reactive, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import {
  filterRightArmTracks,
  computeModelScale,
  computeGroundOffset,
  computeCenterOffsetX,
  computeDragRotation,
  computeDragPan,
  clampPixelRatio,
} from './sceneUtils.js'

export function useScene(canvasRef) {
  const loading = ref(true)
  const loadError = ref(null)
  const model = shallowRef(null)
  const skeleton = shallowRef(null)
  const boneMap = shallowRef({})

  let renderer, scene, camera, animationId
  let mixer = null
  let resizeObserver = null
  const clock = new THREE.Clock()

  // Callbacks other composables can hook into
  const onFrameCallbacks = []
  function onFrame(cb) {
    onFrameCallbacks.push(cb)
  }

  function init(canvas) {
    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2

    // Scene — sky gradient background via fullscreen quad
    scene = new THREE.Scene()
    // No solid background — the sky shader quad handles it

    // Fullscreen sky gradient rendered as a screen-space quad
    // using a custom ShaderMaterial so the gradient is always screen-aligned
    const skyUniforms = {
      topColor:    { value: new THREE.Color(0x2e8fdd) }, // bright game-day blue
      bottomColor: { value: new THREE.Color(0xeee0c8) }, // warm light horizon haze
      midColor:    { value: new THREE.Color(0x87ceee) }, // light sky blue
      offset:      { value: 0.38 },
    }
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        varying vec2 vUv;
        void main() {
          float t = vUv.y;
          vec3 color;
          if (t > offset) {
            color = mix(midColor, topColor, (t - offset) / (1.0 - offset));
          } else {
            color = mix(bottomColor, midColor, t / offset);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
    const skyGeo = new THREE.PlaneGeometry(2, 2)
    const skyMesh = new THREE.Mesh(skyGeo, skyMat)
    skyMesh.frustumCulled = false
    skyMesh.renderOrder = -9999
    scene.add(skyMesh)

    // Camera — will be positioned after model loads
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 1.2, 3)
    camera.lookAt(0, 1, 0)

    // Lighting — golden afternoon game (roughly 3 pm sun from the side)
    const ambient = new THREE.AmbientLight(0xfff8e7, 1.2)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffdd88, 2.8)  // warm golden sun
    sun.position.set(5, 6, 2)                               // side-angled, not overhead
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.1
    sun.shadow.camera.far = 20
    sun.shadow.camera.left = -4
    sun.shadow.camera.right = 4
    sun.shadow.camera.top = 4
    sun.shadow.camera.bottom = -4
    scene.add(sun)

    // Front fill — keeps hands and face readable toward camera
    const frontFill = new THREE.DirectionalLight(0xfff0e0, 1.6)
    frontFill.position.set(0, 1.5, 5)
    scene.add(frontFill)

    const fill = new THREE.DirectionalLight(0x5bb8f5, 0.7) // sky-colored fill
    fill.position.set(-2, 3, 2)
    scene.add(fill)

    // ── Grass outfield plane ──────────────────────────────────────────────────
    const grassCanvas = document.createElement('canvas')
    grassCanvas.width = 512
    grassCanvas.height = 512
    const gCtx = grassCanvas.getContext('2d')
    gCtx.fillStyle = '#3d7a2e'
    gCtx.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 5000; i++) {
      const gx = Math.random() * 512
      const gy = Math.random() * 512
      const v  = Math.floor(Math.random() * 28) - 14
      gCtx.fillStyle = `rgb(${Math.max(0, 61+v)},${Math.max(0, 122+v)},${Math.max(0, 46+v)})`
      gCtx.fillRect(gx, gy, Math.random() * 5 + 1, Math.random() * 2 + 1)
    }
    const grassTex = new THREE.CanvasTexture(grassCanvas)
    grassTex.wrapS = THREE.RepeatWrapping
    grassTex.wrapT = THREE.RepeatWrapping
    grassTex.repeat.set(10, 10)
    const grassPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 28),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92, metalness: 0 })
    )
    grassPlane.rotation.x = -Math.PI / 2
    grassPlane.receiveShadow = true
    scene.add(grassPlane)

    // ── Dirt patch — coach's box area ────────────────────────────────────────
    const dirtCanvas = document.createElement('canvas')
    dirtCanvas.width = 256
    dirtCanvas.height = 256
    const dCtx = dirtCanvas.getContext('2d')
    dCtx.fillStyle = '#c8a470'
    dCtx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 256
      const y = Math.random() * 256
      const shade = Math.floor(Math.random() * 30) - 15
      dCtx.fillStyle = `rgb(${Math.max(0,200+shade)},${Math.max(0,164+shade)},${Math.max(0,112+shade)})`
      dCtx.fillRect(x, y, Math.random() * 3 + 1, Math.random() * 3 + 1)
    }
    const dirtTex = new THREE.CanvasTexture(dirtCanvas)
    dirtTex.wrapS = THREE.RepeatWrapping
    dirtTex.wrapT = THREE.RepeatWrapping
    dirtTex.repeat.set(3, 3)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.0, 48),
      new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95, metalness: 0 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0.002  // just above grass to prevent z-fighting
    ground.receiveShadow = true
    scene.add(ground)

    // ── Baseline chalk strip (continuous line through dirt and onto grass) ──────
    // Single strip centered at origin so it runs through the dirt patch (y=0.005
    // sits above both grass y=0 and dirt y=0.002, making it visible on both).
    const chalkMat = new THREE.MeshBasicMaterial({ color: 0xf0ece0, transparent: true, opacity: 0.82 })
    const baseStrip = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.072), chalkMat)
    baseStrip.rotation.x = -Math.PI / 2
    baseStrip.position.set(0, 0.005, 0)
    scene.add(baseStrip)

    // ── Coach's box chalk outline ─────────────────────────────────────────────
    const bW = 1.5, bD = 0.7, bY = 0.008
    const boxPts = [
      new THREE.Vector3(-bW/2, bY, -bD/2), new THREE.Vector3( bW/2, bY, -bD/2),
      new THREE.Vector3( bW/2, bY, -bD/2), new THREE.Vector3( bW/2, bY,  bD/2),
      new THREE.Vector3( bW/2, bY,  bD/2), new THREE.Vector3(-bW/2, bY,  bD/2),
      new THREE.Vector3(-bW/2, bY,  bD/2), new THREE.Vector3(-bW/2, bY, -bD/2),
    ]
    scene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(boxPts),
      new THREE.LineBasicMaterial({ color: 0xf0ece0 })
    ))

    resize()

    // ResizeObserver fires *after* layout reflows, so it always sees the
    // settled dimensions — unlike window 'resize' which can fire mid-reflow
    // during device rotation or browser-chrome show/hide on mobile.
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(canvas.parentElement)

    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function resize() {
    if (!renderer) return
    const canvas = renderer.domElement
    const parent = canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    if (w === 0 || h === 0) return   // guard during unmount / hidden tabs
    renderer.setSize(w, h)

    if (window.innerWidth > 600) {
      // Desktop: shift the character left to account for the 280px side panel.
      // setViewOffset renders as if the full virtual canvas is (w + panelW) wide,
      // but shows only the left w pixels — centering the 3D scene in the
      // visible (non-panel) area.
      // NOTE: setViewOffset also sets camera.aspect = (w+panelW)/h internally.
      const panelW = 292 // 280px panel + 12px gap
      camera.setViewOffset(w + panelW, h, panelW, 0, w, h)
    } else {
      // Mobile: the quiz panel is in its own section BELOW the canvas (flex layout),
      // so the canvas already fills only the scene area. No offset needed.
      //
      // IMPORTANT: Three.js clearViewOffset() resets camera.aspect to 1, which
      // would make the character appear square on every resize. Instead we
      // disable the view manually and set the correct aspect ourselves.
      if (camera.view) camera.view.enabled = false
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
  }

  function onVisibilityChange() {
    // On mobile, leaving and returning to the tab can change the viewport
    // without firing a resize event (e.g. browser chrome appearing).
    if (document.visibilityState === 'visible') resize()
  }

  function loadModel() {
    const loader = new FBXLoader()
    loader.load(
      import.meta.env.BASE_URL + 'models/Idle.fbx',
      (fbx) => {
        // Mixamo FBX models can be very large — normalize scale
        // Measure bounding box first
        const box = new THREE.Box3().setFromObject(fbx)
        const desiredHeight = 1.8 // ~1.8 units tall
        fbx.scale.setScalar(computeModelScale(box.max.y - box.min.y, desiredHeight))

        // Recompute box after scale
        box.setFromObject(fbx)
        const center = box.getCenter(new THREE.Vector3())
        fbx.position.y += computeGroundOffset(box.min.y) // feet on ground
        fbx.position.x += computeCenterOffsetX(center.x) // center horizontally

        fbx.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        scene.add(fbx)
        model.value = fbx

        // Debug: expose to console for bone inspection
        if (typeof window !== 'undefined') {
          window.__fbxModel = fbx
          window.__threeScene = scene
          const allBones = []
          fbx.traverse((c) => { if (c.isBone) allBones.push(c.name) })
          console.log('All bone names:', JSON.stringify(allBones))
        }

        // Extract skeleton
        fbx.traverse((child) => {
          if (child.isSkinnedMesh && !skeleton.value) {
            skeleton.value = child.skeleton
          }
        })

        // Build bone name → bone lookup
        if (skeleton.value) {
          const map = {}
          skeleton.value.bones.forEach((bone) => {
            map[bone.name] = bone
          })
          boneMap.value = map
        }

        // Set up animation mixer if the FBX has animations
        if (fbx.animations && fbx.animations.length > 0) {
          mixer = new THREE.AnimationMixer(fbx)

          // Remove right arm tracks from the idle animation so IK has full control.
          // See sceneUtils.RIGHT_ARM_BONE_PATTERNS for the full list.
          const clip = fbx.animations[0]
          clip.tracks = filterRightArmTracks(clip.tracks)

          const action = mixer.clipAction(clip)
          action.play()
        }

        // Position camera relative to model
        const finalBox = new THREE.Box3().setFromObject(fbx)
        const modelCenter = finalBox.getCenter(new THREE.Vector3())
        camera.position.set(0, modelCenter.y, desiredHeight * 1.6)
        camera.lookAt(0, modelCenter.y, 0)
        resize() // reapply setViewOffset with updated camera position

        loading.value = false
      },
      (progress) => {
        // progress callback — could add a progress bar
      },
      (error) => {
        console.error('FBX load error:', error)
        loadError.value = error.message || 'Failed to load model'
        loading.value = false
      }
    )
  }

  function animate() {
    animationId = requestAnimationFrame(animate)
    const delta = clock.getDelta()

    if (mixer) mixer.update(delta)
    applyLeftArmSwing()   // after animation, before IK/anchor callbacks

    for (const cb of onFrameCallbacks) {
      cb(delta)
    }

    renderer.render(scene, camera)
  }

  // --- Left arm pose (per-gesture) ---
  // Two axes applied after mixer.update() so IK/anchor callbacks see the result.
  //   forward: rotate around model -X  → swings hand from side toward front
  //   raise:   rotate around model -Z  → lifts hand from hanging toward overhead
  // Values are set by the sequencer (tweened per anchor) or by the calibration
  // UI for live preview.
  const leftArmPose = reactive({ forward: 0, raise: 0 })
  let _leftArmBone = null
  const _leftArmSwingQuat    = new THREE.Quaternion()
  const _leftArmParentInvMat = new THREE.Matrix4()
  const _leftArmAxis         = new THREE.Vector3()

  function applyLeftArmSwing() {
    const { forward, raise } = leftArmPose
    if (!model.value || (forward === 0 && raise === 0)) return

    // Lazy-find the LeftArm bone (upper arm only, not ForeArm or Hand)
    if (!_leftArmBone) {
      const bones = boneMap.value
      _leftArmBone = Object.values(bones).find(b =>
        b.name.includes('LeftArm') &&
        !b.name.includes('ForeArm') &&
        !b.name.includes('Hand'),
      ) ?? null
      if (!_leftArmBone) return
    }

    // Convert both axes from model/world space to LeftArm's parent-bone local space.
    // We read parent.matrixWorld once (before either rotation is applied) so both
    // axes are expressed in the same original coordinate frame.
    _leftArmBone.parent.updateWorldMatrix(true, false)
    _leftArmParentInvMat.copy(_leftArmBone.parent.matrixWorld).invert()

    if (forward !== 0) {
      // Around model's -X (character's left axis): + = arm swings toward front
      _leftArmAxis.set(-1, 0, 0).transformDirection(model.value.matrixWorld)
      _leftArmAxis.transformDirection(_leftArmParentInvMat).normalize()
      _leftArmSwingQuat.setFromAxisAngle(_leftArmAxis, THREE.MathUtils.degToRad(forward))
      _leftArmBone.quaternion.premultiply(_leftArmSwingQuat)
    }

    if (raise !== 0) {
      // Around model's -Z (character's backward axis): + = arm rises upward
      _leftArmAxis.set(0, 0, -1).transformDirection(model.value.matrixWorld)
      _leftArmAxis.transformDirection(_leftArmParentInvMat).normalize()
      _leftArmSwingQuat.setFromAxisAngle(_leftArmAxis, THREE.MathUtils.degToRad(raise))
      _leftArmBone.quaternion.premultiply(_leftArmSwingQuat)
    }

    _leftArmBone.updateMatrixWorld(true)
  }

  function setLeftArmPose(forward, raise) {
    leftArmPose.forward = forward
    leftArmPose.raise   = raise
  }

  // --- Model transform controls (rotation + horizontal position) ---
  const modelRotation = ref(0)   // Y-axis rotation in radians
  const modelOffsetX = ref(0)    // horizontal offset

  // Pointer drag state
  let isDragging = false
  let dragStartX = 0
  let dragStartRotation = 0
  let dragButton = -1 // 0 = left (rotate), 2 = right (move)
  let pointerIds = []  // for touch tracking

  function applyModelTransform() {
    if (!model.value) return
    model.value.rotation.y = modelRotation.value
    model.value.position.x = modelOffsetX.value
  }

  function onPointerDown(e) {
    // Ignore if the event target is a UI element overlaying the canvas
    if (e.target !== renderer?.domElement) return

    if (e.pointerType === 'touch') {
      pointerIds.push(e.pointerId)
      // Two-finger touch → treat as pan (move)
      if (pointerIds.length === 2) {
        dragButton = 2
        dragStartX = e.clientX
        dragStartRotation = modelOffsetX.value
        isDragging = true
        return
      }
    }

    isDragging = true
    dragStartX = e.clientX
    dragButton = e.button // 0 = left, 2 = right
    if (dragButton === 0) {
      dragStartRotation = modelRotation.value
    } else {
      dragStartRotation = modelOffsetX.value
    }
  }

  function onPointerMove(e) {
    if (!isDragging) return
    const dx = e.clientX - dragStartX
    const canvas = renderer?.domElement
    if (!canvas) return
    const w = canvas.clientWidth

    if (dragButton === 0) {
      // Left-drag / single-touch: rotate
      modelRotation.value = computeDragRotation(dragStartRotation, dx, w)
      applyModelTransform()
    } else {
      // Right-drag / two-finger: move left/right
      modelOffsetX.value = computeDragPan(dragStartRotation, dx, w)
      applyModelTransform()
    }
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch') {
      pointerIds = pointerIds.filter((id) => id !== e.pointerId)
    }
    if (pointerIds.length === 0) {
      isDragging = false
      dragButton = -1
    }
  }

  function onContextMenu(e) {
    // Prevent right-click context menu on the canvas
    if (e.target === renderer?.domElement) {
      e.preventDefault()
    }
  }

  function setModelRotation(radians) {
    modelRotation.value = radians
    applyModelTransform()
  }

  function setModelOffsetX(x) {
    modelOffsetX.value = x
    applyModelTransform()
  }

  function setupPointerControls() {
    const canvas = renderer?.domElement
    if (!canvas) return
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.style.touchAction = 'none' // prevent browser gestures
  }

  function teardownPointerControls() {
    const canvas = renderer?.domElement
    if (canvas) {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  function getScene() { return scene }
  function getCamera() { return camera }
  function getRenderer() { return renderer }

  onMounted(() => {
    if (canvasRef.value) {
      init(canvasRef.value)
      setupPointerControls()
      loadModel()
      animate()
    }
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(animationId)
    teardownPointerControls()
    resizeObserver?.disconnect()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    renderer?.dispose()
  })

  return {
    loading,
    loadError,
    model,
    skeleton,
    boneMap,
    onFrame,
    getScene,
    getCamera,
    getRenderer,
    resize,
    modelRotation,
    modelOffsetX,
    setModelRotation,
    setModelOffsetX,
    leftArmPose,
    setLeftArmPose,
  }
}
