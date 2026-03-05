import { ref, reactive, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export function useScene(canvasRef) {
  const loading = ref(true)
  const loadError = ref(null)
  const model = shallowRef(null)
  const skeleton = shallowRef(null)
  const boneMap = shallowRef({})

  let renderer, scene, camera, animationId
  let mixer = null
  const clock = new THREE.Clock()

  // Callbacks other composables can hook into
  const onFrameCallbacks = []
  function onFrame(cb) {
    onFrameCallbacks.push(cb)
  }

  function init(canvas) {
    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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
      topColor:    { value: new THREE.Color(0x3a7bd5) },
      bottomColor: { value: new THREE.Color(0xc4a56e) }, // warm dirt-horizon blend
      midColor:    { value: new THREE.Color(0x87CEEB) },
      offset:      { value: 0.4 },
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

    // Lighting — bright outdoor sunlight
    const ambient = new THREE.AmbientLight(0xfff8e7, 1.4)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfffbe6, 2.5)
    sun.position.set(3, 5, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.1
    sun.shadow.camera.far = 20
    sun.shadow.camera.left = -3
    sun.shadow.camera.right = 3
    sun.shadow.camera.top = 3
    sun.shadow.camera.bottom = -3
    scene.add(sun)

    // Front fill — illuminates hands and face directly toward camera
    const frontFill = new THREE.DirectionalLight(0xfff0e0, 1.8)
    frontFill.position.set(0, 1.5, 5)
    scene.add(frontFill)

    const fill = new THREE.DirectionalLight(0x87CEEB, 0.8) // sky-colored fill
    fill.position.set(-2, 3, 2)
    scene.add(fill)

    // Ground — baseball infield dirt
    const dirtCanvas = document.createElement('canvas')
    dirtCanvas.width = 256
    dirtCanvas.height = 256
    const dCtx = dirtCanvas.getContext('2d')
    // Base dirt color
    dCtx.fillStyle = '#c4a56e'
    dCtx.fillRect(0, 0, 256, 256)
    // Add subtle noise for texture
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 256
      const y = Math.random() * 256
      const shade = Math.floor(Math.random() * 30) - 15
      const r = 196 + shade
      const g = 165 + shade
      const b = 110 + shade
      dCtx.fillStyle = `rgb(${r},${g},${b})`
      dCtx.fillRect(x, y, Math.random() * 3 + 1, Math.random() * 3 + 1)
    }
    const dirtTexture = new THREE.CanvasTexture(dirtCanvas)
    dirtTexture.wrapS = THREE.RepeatWrapping
    dirtTexture.wrapT = THREE.RepeatWrapping
    dirtTexture.repeat.set(4, 4)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3, 48),
      new THREE.MeshStandardMaterial({
        map: dirtTexture,
        roughness: 0.95,
        metalness: 0.0,
      })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    resize()
    window.addEventListener('resize', resize)
  }

  function resize() {
    if (!renderer) return
    const canvas = renderer.domElement
    const parent = canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    renderer.setSize(w, h)

    // Shift the character into the visible area to the left of the side panel.
    // The panel is 280px wide + 12px margin = 292px from the right edge.
    // setViewOffset renders as if the full virtual canvas is (w + panelW) wide,
    // but shows only the rightmost w pixels — placing the 3D center at the
    // midpoint of the visible (non-panel) area.
    const panelW = 292
    camera.setViewOffset(w + panelW, h, panelW, 0, w, h)
    // setViewOffset internally updates aspect and calls updateProjectionMatrix
  }

  function loadModel() {
    const loader = new FBXLoader()
    loader.load(
      import.meta.env.BASE_URL + 'models/Idle.fbx',
      (fbx) => {
        // Mixamo FBX models can be very large — normalize scale
        // Measure bounding box first
        const box = new THREE.Box3().setFromObject(fbx)
        const height = box.max.y - box.min.y
        const desiredHeight = 1.8 // ~1.8 units tall
        const scaleFactor = desiredHeight / height
        fbx.scale.setScalar(scaleFactor)

        // Recompute box after scale
        box.setFromObject(fbx)
        const center = box.getCenter(new THREE.Vector3())
        fbx.position.y -= box.min.y // feet on ground
        fbx.position.x -= center.x // center horizontally

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
          // We filter out any tracks that target the right shoulder/arm/forearm/hand bones.
          const clip = fbx.animations[0]
          const rightArmBonePatterns = [
            'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
            'RightHandThumb', 'RightHandIndex', 'RightHandMiddle',
            'RightHandRing', 'RightHandPinky',
          ]
          clip.tracks = clip.tracks.filter((track) => {
            // Track names look like "boneName.quaternion" or "boneName.position"
            const boneName = track.name.split('.')[0]
            return !rightArmBonePatterns.some((pattern) => boneName.includes(pattern))
          })

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
      modelRotation.value = dragStartRotation + (dx / w) * Math.PI * 2
      applyModelTransform()
    } else {
      // Right-drag / two-finger: move left/right
      modelOffsetX.value = dragStartRotation + (dx / w) * 3
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
    window.removeEventListener('resize', resize)
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
