import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector(".webgl");
const statusNode = document.querySelector(".status-toast");
const debugNode = document.querySelector(".debug");
const resetButton = document.querySelector(".js-reset-view");
const toggleGizmoButton = document.querySelector(".js-toggle-gizmo");
const layoutV1Button = document.querySelector(".js-layout-v1");
const layoutV2Button = document.querySelector(".js-layout-v2");
const toggleDebugButton = document.querySelector(".js-toggle-debug");
const loadModelButton = document.querySelector(".js-load-model");
const tutorialButton = document.querySelector(".js-show-tutorial");
const modelFileInput = document.querySelector(".js-model-file");
const tutorialNode = document.querySelector(".tutorial");
const tutorialTrailNode = document.querySelector(".tutorial__trail");
const tutorialEffectsNode = document.querySelector(".tutorial__effects");
const tutorialCursorNode = document.querySelector(".tutorial__cursor");
const tutorialTextNode = document.querySelector(".tutorial__text");
const whiteOpacityInput = document.querySelector(".js-white-opacity");
const whiteHoverInput = document.querySelector(".js-white-hover");
const gizmoOffsetInput = document.querySelector(".js-gizmo-offset");
const handleShapeInput = document.querySelector(".js-handle-shape");

const AXIS_VECTORS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const STEP_ROTATION = THREE.MathUtils.degToRad(5);
const TUTORIAL_DRAG_ROTATION = THREE.MathUtils.degToRad(42);
const SCALE_STEP_FACTOR = 1.08;
const MIN_MODEL_SCALE = 0.04;
const MAX_MODEL_SCALE = 8;
const MODEL_SCREEN_FIT = 0.76;
const GIZMO_SCREEN_FIT = 0.48;
const CENTER_CONTROL_PIXELS = 120;
const CENTER_PICKER_PIXELS = 164;
const CENTER_FORWARD_PIXELS = 22;
const SCALE_UI_OPACITY = 0.2;
const SCALE_UI_HOVER_OPACITY = 0.5;
const DEFAULT_MODEL_SOURCE = "./model.glb";
const gizmoConfig = {
  whiteOpacity: 0.02,
  whiteHoverOpacity: 0.5,
  offsetMultiplier: 0.58,
  handleShape: "arrow",
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151515);
scene.fog = new THREE.Fog(0x151515, 14, 34);

const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 250);
camera.position.set(3.6, 2.8, 6.5);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.autoClear = false;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 1.5;
controls.maxDistance = 24;
controls.target.set(0, 1.2, 0);

const transformPivot = new THREE.Group();
scene.add(transformPivot);

const modelRoot = new THREE.Group();
scene.add(modelRoot);

let gizmo = createRotationGizmo();
gizmo.visible = false;
scene.add(gizmo);

let gizmoPickers = createGizmoPickers();
gizmoPickers.visible = false;
scene.add(gizmoPickers);

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

const hemisphereLight = new THREE.HemisphereLight(0xd8d1c8, 0x18130f, 1.7);
scene.add(hemisphereLight);

const keyLight = new THREE.DirectionalLight(0xfff2e8, 2.3);
keyLight.position.set(6, 9, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 50;
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -10;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8fa4ff, 0.55);
fillLight.position.set(-6, 4, -6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffdfc7, 0.4);
rimLight.position.set(1.5, 5.5, -8);
scene.add(rimLight);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  }),
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -0.001;
shadowCatcher.receiveShadow = true;
shadowCatcher.renderOrder = 1;
scene.add(shadowCatcher);

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerStart = new THREE.Vector2();
const pointerCurrent = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragHitPoint = new THREE.Vector3();
const dragCurrentPoint = new THREE.Vector3();
const tempCross = new THREE.Vector3();
const worldPivot = new THREE.Vector3();
const worldDirection = new THREE.Vector3();
const screenNormal = new THREE.Vector3();
const modelCenterWorld = new THREE.Vector3();
const quaternionDelta = new THREE.Quaternion();
const debugBounds = new THREE.Box3();
const debugSize = new THREE.Vector3();
const debugCenter = new THREE.Vector3();
const projectedMin = new THREE.Vector2();
const projectedMax = new THREE.Vector2();
const projectedCorner = new THREE.Vector3();
const viewportSize = new THREE.Vector2();
const screenPoint = new THREE.Vector2();
const tutorialLocalPoint = new THREE.Vector3();
let statusTimer = null;

const state = {
  model: null,
  moved: false,
  draggingControl: null,
  hoveredControl: null,
  dragStartQuaternion: new THREE.Quaternion(),
  dragStartVector: new THREE.Vector3(),
  dragNormal: new THREE.Vector3(),
  dragStartScale: 1,
  dragStartClientY: 0,
  modelLocalCenter: new THREE.Vector3(),
  baseSize: new THREE.Vector3(),
  initialCameraPosition: new THREE.Vector3(),
  initialTarget: new THREE.Vector3(),
  tutorialCameraPosition: new THREE.Vector3(),
  tutorialTarget: new THREE.Vector3(),
  gizmoVisible: true,
  debugVisible: true,
  hasLoadedModel: false,
  currentModelLabel: "model.glb",
  objectUrl: null,
  loaderStatus: "init",
  lastError: "",
  meshCount: 0,
  scaleLayout: "v1",
  tutorialRunning: false,
  tutorialToken: 0,
};

resetButton.addEventListener("click", () => {
  resetSceneState();
});

toggleGizmoButton.addEventListener("click", () => {
  toggleGizmoVisibility();
});

layoutV1Button.addEventListener("click", () => {
  setScaleLayout("v1");
});

layoutV2Button.addEventListener("click", () => {
  setScaleLayout("v2");
});

toggleDebugButton.addEventListener("click", () => {
  state.debugVisible = !state.debugVisible;
  updateDebugVisibility();
});

loadModelButton.addEventListener("click", () => {
  modelFileInput.click();
});

tutorialButton.addEventListener("click", () => {
  if (state.tutorialRunning) {
    stopTutorial();
    return;
  }

  startTutorial();
});

modelFileInput.addEventListener("change", () => {
  const file = modelFileInput.files?.[0];
  if (!file) {
    return;
  }

  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
  }

  state.objectUrl = URL.createObjectURL(file);
  loadModelFromSource(state.objectUrl, file.name);
  modelFileInput.value = "";
});

bindConstructorUI();
updateDebugVisibility();
updateLayoutButtons();
loadModelFromSource(DEFAULT_MODEL_SOURCE, "model.glb");

canvas.addEventListener("pointerdown", handlePointerDown, true);
window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp, true);

window.addEventListener("resize", () => {
  const target = controls.target.clone();
  const cameraOffset = camera.position.clone().sub(target);

  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  camera.position.copy(target).add(cameraOffset);
  controls.target.copy(target);
  controls.update();
});

function handlePointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  pointerStart.set(event.clientX, event.clientY);
  pointerCurrent.copy(pointerStart);
  state.moved = false;

  if (!state.model || !gizmo.visible) {
    return;
  }

  const controlHit = intersectGizmoControls(event);
  if (!controlHit) {
    return;
  }

  if (!beginControlDrag(controlHit.object.userData, event)) {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function handlePointerMove(event) {
  pointerCurrent.set(event.clientX, event.clientY);

  if (pointerStart.distanceTo(pointerCurrent) > 4) {
    state.moved = true;
  }

  if (!state.model || !gizmo.visible) {
    return;
  }

  if (state.draggingControl) {
    updateControlDrag(event);
    canvas.style.cursor = "grabbing";
    return;
  }

  const controlHit = intersectGizmoControls(event);
  setHoveredControl(controlHit ? controlHit.object.userData.controlKey : null);
  canvas.style.cursor = state.hoveredControl ? "grab" : "";
}

function handlePointerUp(event) {
  if (state.draggingControl) {
    endControlDrag(event);
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (!state.model || state.moved || event.button !== 0) {
    return;
  }

  setStatus("Pivot remains centered on the model.");
}

function beginControlDrag(controlData, event) {
  if (controlData.type === "scale") {
    state.draggingControl = {
      type: "scale",
      controlKey: controlData.controlKey,
      direction: controlData.direction ?? 0,
    };
    state.dragStartScale = modelRoot.scale.x;
    state.dragStartClientY = event.clientY;
    controls.enabled = false;
    setHoveredControl(controlData.controlKey);
    setStatus(
      controlData.direction > 0
        ? "Scale up: click for a step, drag for continuous scaling..."
        : controlData.direction < 0
          ? "Scale down: click for a step, drag for continuous scaling..."
          : "Scaling model...",
      true,
    );
    return true;
  }

  if (controlData.type === "screen") {
    camera.getWorldDirection(screenNormal).normalize();
    const hitPoint = intersectPointerPlane(event, screenNormal, dragHitPoint);

    if (!hitPoint) {
      return false;
    }

    const direction = controlData.direction ?? (hitPoint.y >= gizmo.position.y ? -1 : 1);

    state.draggingControl = {
      type: "screen",
      controlKey: controlData.controlKey,
      direction,
    };
    state.dragStartQuaternion.copy(transformPivot.quaternion);
    state.dragStartVector.copy(hitPoint).sub(gizmo.position).normalize();
    state.dragNormal.copy(screenNormal);

    if (state.dragStartVector.lengthSq() < 0.25) {
      state.draggingControl = null;
      return false;
    }

    controls.enabled = false;
    state.moved = false;
    setHoveredControl(controlData.controlKey);
    setStatus("Screen-space rotation...", true);
    return true;
  }

  const axisVector = AXIS_VECTORS[controlData.axis];
  const hitPoint = intersectPointerPlane(event, axisVector, dragHitPoint);

  if (!hitPoint) {
    return false;
  }

  state.draggingControl = {
    type: "axis",
    axis: controlData.axis,
    controlKey: controlData.controlKey,
    direction: controlData.direction ?? 1,
  };
  state.dragStartQuaternion.copy(transformPivot.quaternion);
  state.dragStartVector.copy(hitPoint).sub(gizmo.position).normalize();
  state.dragNormal.copy(axisVector);

  if (state.dragStartVector.lengthSq() < 0.25) {
    state.draggingControl = null;
    return false;
  }

  controls.enabled = false;
  state.moved = false;
  setHoveredControl(controlData.controlKey);
  setStatus(`Rotating around ${controlData.axis.toUpperCase()} axis...`, true);
  return true;
}

function updateControlDrag(event) {
  if (state.draggingControl.type === "scale") {
    const desiredScale = THREE.MathUtils.clamp(
      state.dragStartScale * Math.exp((state.dragStartClientY - event.clientY) * 0.01),
      MIN_MODEL_SCALE,
      MAX_MODEL_SCALE,
    );
    modelRoot.scale.setScalar(clampScaleToView(desiredScale));
    return;
  }

  const hitPoint = intersectPointerPlane(event, state.dragNormal, dragCurrentPoint);
  if (!hitPoint) {
    return;
  }

  worldDirection.copy(hitPoint).sub(gizmo.position).normalize();
  if (worldDirection.lengthSq() < 0.25) {
    return;
  }

  const angle = Math.atan2(
    state.dragNormal.dot(tempCross.copy(state.dragStartVector).cross(worldDirection)),
    state.dragStartVector.dot(worldDirection),
  );

  quaternionDelta.setFromAxisAngle(state.dragNormal, angle);
  transformPivot.quaternion.copy(quaternionDelta).multiply(state.dragStartQuaternion);
}

function endControlDrag(event) {
  const drag = state.draggingControl;

  state.draggingControl = null;
  controls.enabled = true;
  setHoveredControl(null);
  canvas.style.cursor = "";

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (drag.type === "axis" && !state.moved) {
    quaternionDelta.setFromAxisAngle(AXIS_VECTORS[drag.axis], STEP_ROTATION * drag.direction);
    transformPivot.quaternion.copy(quaternionDelta).multiply(state.dragStartQuaternion);
  }

  if (drag.type === "screen" && !state.moved) {
    camera.getWorldDirection(screenNormal).normalize();
    quaternionDelta.setFromAxisAngle(screenNormal, STEP_ROTATION * drag.direction);
    transformPivot.quaternion.copy(quaternionDelta).multiply(state.dragStartQuaternion);
  }

  if (drag.type === "scale" && !state.moved && drag.direction) {
    const nextScale = clampScaleToView(
      state.dragStartScale * (drag.direction > 0 ? SCALE_STEP_FACTOR : 1 / SCALE_STEP_FACTOR),
    );
    modelRoot.scale.setScalar(nextScale);
  }

  centerPivotOnModel();

  if (drag.type === "scale") {
    if (!state.moved && drag.direction > 0) {
      setStatus("Scale increased.");
      return;
    }

    if (!state.moved && drag.direction < 0) {
      setStatus("Scale decreased.");
      return;
    }

    setStatus("Scale applied. Pivot recentered to the exact model center.");
    return;
  }

  if (drag.type === "screen") {
    setStatus(
      !state.moved
      ? `Screen rotation applied by ${drag.direction > 0 ? "+" : "-"}5 degrees.`
      : "Screen rotation applied. Pivot recentered to the exact model center.",
    );
    return;
  }

  setStatus(
    !state.moved
    ? `Axis ${drag.axis.toUpperCase()} rotated by ${drag.direction > 0 ? "+" : "-"}5 degrees.`
    : `Rotation applied on ${drag.axis.toUpperCase()}. Pivot recentered to the exact model center.`,
  );
}

function centerPivotOnModel() {
  if (!state.model) {
    return;
  }

  modelCenterWorld.copy(state.modelLocalCenter);
  modelRoot.localToWorld(modelCenterWorld);

  scene.attach(modelRoot);

  transformPivot.position.copy(modelCenterWorld);
  transformPivot.quaternion.identity();
  transformPivot.updateMatrixWorld(true);

  transformPivot.attach(modelRoot);
  gizmo.position.copy(modelCenterWorld);
  gizmoPickers.position.copy(modelCenterWorld);
  controls.target.copy(modelCenterWorld);
}

function resetSceneState() {
  if (!state.model) {
    return;
  }

  scene.attach(modelRoot);
  modelRoot.position.set(0, 0, 0);
  modelRoot.quaternion.identity();
  modelRoot.scale.setScalar(1);

  centerPivotOnModel();
  controls.update();
  setStatus("Model transform reset. Camera preserved.");
}

function toggleGizmoVisibility() {
  if (!state.model) {
    return;
  }

  state.gizmoVisible = !state.gizmoVisible;
  gizmo.visible = state.gizmoVisible;
  gizmoPickers.visible = state.gizmoVisible;
  setHoveredControl(null);
  updateGizmoButtonLabel();
  setStatus(state.gizmoVisible ? "Gizmo shown." : "Gizmo hidden.");
}

function updateGizmoButtonLabel() {
  toggleGizmoButton.textContent = state.gizmoVisible ? "Hide Gizmo" : "Show Gizmo";
}

function updateDebugVisibility() {
  debugNode.classList.toggle("is-hidden", !state.debugVisible);
  toggleDebugButton.textContent = state.debugVisible ? "Hide Debug" : "Show Debug";
}

function setScaleLayout(layout) {
  if (state.scaleLayout === layout) {
    return;
  }

  state.scaleLayout = layout;
  updateLayoutButtons();
  setStatus(layout === "v2" ? "Scale control moved to bottom position." : "Scale control restored to center.");
}

function updateLayoutButtons() {
  layoutV1Button.classList.toggle("toolbar__button--active", state.scaleLayout === "v1");
  layoutV2Button.classList.toggle("toolbar__button--active", state.scaleLayout === "v2");
}

function setStatus(message, persist = false) {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  statusNode.classList.add("is-visible");

  if (statusTimer) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (persist) {
    return;
  }

  statusTimer = window.setTimeout(() => {
    statusNode.classList.remove("is-visible");
  }, 2600);
}

function startTutorial() {
  if (!state.model || !gizmo.visible) {
    setStatus("Load a model and show the gizmo first.");
    return;
  }

  transformPivot.getWorldPosition(worldPivot);
  state.tutorialCameraPosition.copy(camera.position);
  state.tutorialTarget.copy(controls.target);
  state.tutorialRunning = true;
  state.tutorialToken += 1;
  tutorialButton.textContent = "Stop Tutorial";
  tutorialNode.classList.remove("is-hidden");
  runTutorial(state.tutorialToken);
}

function stopTutorial() {
  if (state.tutorialRunning && state.model) {
    camera.position.copy(state.tutorialCameraPosition);
    controls.target.copy(state.tutorialTarget);
    controls.update();
    resetSceneState();
  }

  state.tutorialRunning = false;
  state.tutorialToken += 1;
  tutorialButton.textContent = "Show Tutorial";
  tutorialNode.classList.add("is-hidden");
  setHoveredControl(null);
  tutorialTrailNode.style.opacity = "0";
  tutorialEffectsNode.innerHTML = "";
  tutorialCursorNode.classList.remove("is-pressed");
}

async function runTutorial(token) {
  resetSceneState();
  tutorialEffectsNode.innerHTML = "";

  const whiteTop = getScreenPointForScreenButton("screen:-1");
  const centerPoint = getScreenPointForCenter();
  const whiteDragFrom = getScreenArcPoint(32);
  const whiteDragTo = getScreenArcPoint(-32);

  if (!whiteTop || !centerPoint || !whiteDragFrom || !whiteDragTo) {
    stopTutorial();
    setStatus("Tutorial could not resolve gizmo positions.");
    return;
  }

  tutorialCursorNode.dataset.x = String(whiteDragFrom.x);
  tutorialCursorNode.dataset.y = String(whiteDragFrom.y);
  tutorialCursorNode.style.left = `${whiteDragFrom.x}px`;
  tutorialCursorNode.style.top = `${whiteDragFrom.y}px`;

  tutorialTextNode.textContent = "White arrow: drag to rotate in screen space.";
  await tutorialDragRotation({
    from: whiteDragFrom,
    to: whiteDragTo,
    hoverKey: "screen:arc",
    axisVector: camera.getWorldDirection(new THREE.Vector3()).normalize().clone(),
    deltaAngle: -TUTORIAL_DRAG_ROTATION,
    label: "Left button drag",
    token,
  });

  tutorialTextNode.textContent = "White buttons: rapid left clicks, then return.";
  await tutorialRapidClicks(getScreenPointForScreenButton("screen:-1"), "screen:-1", "Left button click", () => {
    applyRotationStep(camera.getWorldDirection(new THREE.Vector3()).normalize(), -STEP_ROTATION);
  }, 10, token);
  await tutorialRapidClicks(getScreenPointForScreenButton("screen:1"), "screen:1", "Left button click", () => {
    applyRotationStep(camera.getWorldDirection(new THREE.Vector3()).normalize(), STEP_ROTATION);
  }, 10, token);

  tutorialTextNode.textContent = "Green axis: drag, then click both directions.";
  await tutorialAxisDemo("y", { dragFrom: -38, dragTo: 34 }, token);

  tutorialTextNode.textContent = "Red axis: drag, then click both directions.";
  await tutorialAxisDemo("x", { dragFrom: 102, dragTo: -96 }, token);

  tutorialTextNode.textContent = "Blue axis: drag, then click both directions.";
  await tutorialAxisDemo("z", { dragFrom: 38, dragTo: -34 }, token);

  tutorialTextNode.textContent = "Scale: rapid clicks up and down, then drag.";
  await tutorialRapidScaleClicks("scale:plus", token);
  await tutorialRapidScaleClicks("scale:minus", token);
  await tutorialScaleDrag(token);

  if (token === state.tutorialToken) {
    camera.position.copy(state.tutorialCameraPosition);
    controls.target.copy(state.tutorialTarget);
    controls.update();
    resetSceneState();
    stopTutorial();
    setStatus("Tutorial finished.");
  }
}

function animateTutorialCursor(targetX, targetY, duration, token, onUpdate = null) {
  return new Promise((resolve) => {
    const startX = Number(tutorialCursorNode.dataset.x ?? targetX);
    const startY = Number(tutorialCursorNode.dataset.y ?? targetY);
    const startTime = performance.now();

    const tick = (now) => {
      if (token !== state.tutorialToken) {
        resolve();
        return;
      }

      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      const nextX = THREE.MathUtils.lerp(startX, targetX, eased);
      const nextY = THREE.MathUtils.lerp(startY, targetY, eased);
      tutorialCursorNode.style.left = `${nextX}px`;
      tutorialCursorNode.style.top = `${nextY}px`;
      tutorialCursorNode.dataset.x = String(nextX);
      tutorialCursorNode.dataset.y = String(nextY);
      onUpdate?.(eased, nextX, nextY);

      if (t >= 1) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });
}

function waitTutorial(duration, token) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (token === state.tutorialToken) {
        resolve();
        return;
      }

      resolve();
    }, duration);
  });
}

function worldToClient(worldPosition) {
  worldPosition.project(camera);

  if (worldPosition.z > 1) {
    return null;
  }

  return {
    x: ((worldPosition.x + 1) * 0.5) * sizes.width,
    y: ((1 - worldPosition.y) * 0.5) * sizes.height,
  };
}

async function tutorialAxisClick(axis, direction, label, token) {
  const point = getScreenPointForAxisHandle(axis, direction);
  await tutorialClickAction(point, `axis:${axis}`, label, () => {
    applyRotationStep(AXIS_VECTORS[axis], STEP_ROTATION * direction);
  }, token);
}

async function tutorialAxisDemo(axis, config, token) {
  const from = getAxisCurvePoint(axis, config.dragFrom);
  const to = getAxisCurvePoint(axis, config.dragTo);
  if (!from || !to) {
    return;
  }

  await tutorialDragRotation({
    from,
    to,
    hoverKey: `axis:${axis}`,
    axisVector: AXIS_VECTORS[axis],
    deltaAngle: TUTORIAL_DRAG_ROTATION,
    label: "Left button drag",
    token,
  });
  await tutorialRapidAxisClicks(axis, 1, token);
  await tutorialRapidAxisClicks(axis, -1, token);
}

async function tutorialRapidAxisClicks(axis, direction, token) {
  const point = getScreenPointForAxisHandle(axis, direction);
  await tutorialRapidClicks(point, `axis:${axis}`, "Left button click", () => {
    applyRotationStep(AXIS_VECTORS[axis], STEP_ROTATION * direction);
  }, 10, token);
}

async function tutorialScaleClick(controlKey, label, token) {
  const point = getScreenPointForCenterButton(controlKey);
  const direction = controlKey === "scale:plus" ? 1 : -1;
  await tutorialClickAction(point, controlKey, label, () => {
    const nextScale = clampScaleToView(
      modelRoot.scale.x * (direction > 0 ? SCALE_STEP_FACTOR : 1 / SCALE_STEP_FACTOR),
    );
    modelRoot.scale.setScalar(nextScale);
    centerPivotOnModel();
  }, token);
}

async function tutorialRapidScaleClicks(controlKey, token) {
  const point = getScreenPointForCenterButton(controlKey);
  const direction = controlKey === "scale:plus" ? 1 : -1;
  await tutorialRapidClicks(point, controlKey, "Left button click", () => {
    const nextScale = clampScaleToView(
      modelRoot.scale.x * (direction > 0 ? SCALE_STEP_FACTOR : 1 / SCALE_STEP_FACTOR),
    );
    modelRoot.scale.setScalar(nextScale);
    centerPivotOnModel();
  }, 10, token);
}

async function tutorialScaleDrag(token) {
  const center = getScreenPointForCenter();
  if (!center) {
    return;
  }

  tutorialTextNode.textContent = "Drag the center scale icon upward, then return.";
  await tutorialDragScale({
    from: center,
    to: { x: center.x, y: center.y - 110 },
    fromScale: modelRoot.scale.x,
    toScale: clampScaleToView(modelRoot.scale.x * 1.24),
    token,
  });
  await tutorialDragScale({
    from: { x: center.x, y: center.y - 110 },
    to: center,
    fromScale: modelRoot.scale.x,
    toScale: clampScaleToView(1),
    token,
  });
}

async function tutorialClickAction(point, hoverKey, label, action, token) {
  if (!point || token !== state.tutorialToken) {
    return;
  }

  setHoveredControl(hoverKey);
  await animateTutorialCursor(point.x, point.y, 360, token);
  tutorialCursorNode.classList.add("is-pressed");
  tutorialEffect(label, point.x, point.y - 18);
  action();
  await waitTutorial(160, token);
  tutorialCursorNode.classList.remove("is-pressed");
  await waitTutorial(340, token);
}

async function tutorialRapidClicks(point, hoverKey, label, action, count, token) {
  if (!point || token !== state.tutorialToken) {
    return;
  }

  setHoveredControl(hoverKey);
  await animateTutorialCursor(point.x, point.y, 260, token);

  for (let index = 0; index < count; index += 1) {
    if (token !== state.tutorialToken) {
      return;
    }

    tutorialCursorNode.classList.add("is-pressed");
    tutorialEffect(label, point.x, point.y - 18);
    action();
    await waitTutorial(55, token);
    tutorialCursorNode.classList.remove("is-pressed");
    await waitTutorial(45, token);
  }

  await waitTutorial(180, token);
}

async function tutorialDragRotation({ from, to, hoverKey, axisVector, deltaAngle, label, token }) {
  if (!from || !to || token !== state.tutorialToken) {
    return;
  }

  const baseQuaternion = transformPivot.quaternion.clone();
  setHoveredControl(hoverKey);
  await animateTutorialCursor(from.x, from.y, 340, token);
  tutorialCursorNode.classList.add("is-pressed");
  tutorialEffect(label, from.x + 64, from.y - 20);

  await animateTutorialCursor(to.x, to.y, 1400, token, (progress, x, y) => {
    updateTutorialTrail(from, { x, y });
    quaternionDelta.setFromAxisAngle(axisVector, deltaAngle * progress);
    transformPivot.quaternion.copy(quaternionDelta).multiply(baseQuaternion);
  });

  await animateTutorialCursor(from.x, from.y, 1200, token, (progress, x, y) => {
    updateTutorialTrail(to, { x, y });
    quaternionDelta.setFromAxisAngle(axisVector, deltaAngle * (1 - progress));
    transformPivot.quaternion.copy(quaternionDelta).multiply(baseQuaternion);
  });

  tutorialCursorNode.classList.remove("is-pressed");
  tutorialTrailNode.style.opacity = "0";
  centerPivotOnModel();
  await waitTutorial(520, token);
}

async function tutorialDragScale({ from, to, fromScale, toScale, token }) {
  if (token !== state.tutorialToken) {
    return;
  }

  setHoveredControl("scale");
  await animateTutorialCursor(from.x, from.y, 220, token);
  tutorialCursorNode.classList.add("is-pressed");
  tutorialEffect("Left button drag", from.x + 64, from.y - 20);

  await animateTutorialCursor(to.x, to.y, 760, token, (progress, x, y) => {
    updateTutorialTrail(from, { x, y });
    modelRoot.scale.setScalar(THREE.MathUtils.lerp(fromScale, toScale, progress));
  });

  tutorialCursorNode.classList.remove("is-pressed");
  tutorialTrailNode.style.opacity = "0";
  centerPivotOnModel();
  await waitTutorial(300, token);
}

function applyRotationStep(axisVector, deltaAngle) {
  state.dragStartQuaternion.copy(transformPivot.quaternion);
  quaternionDelta.setFromAxisAngle(axisVector, deltaAngle);
  transformPivot.quaternion.copy(quaternionDelta).multiply(state.dragStartQuaternion);
  centerPivotOnModel();
}

function updateTutorialTrail(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  tutorialTrailNode.style.width = `${length}px`;
  tutorialTrailNode.style.left = `${from.x}px`;
  tutorialTrailNode.style.top = `${from.y}px`;
  tutorialTrailNode.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  tutorialTrailNode.style.opacity = "1";
}

function tutorialEffect(text, x, y) {
  const node = document.createElement("div");
  node.className = "tutorial__effect";
  node.textContent = text;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  tutorialEffectsNode.appendChild(node);
  window.setTimeout(() => {
    node.remove();
  }, 900);
}

function getScreenPointForAxisHandle(axis, direction) {
  const handle = gizmo.userData.axisHandles[axis].find((item) => item.direction === direction);
  return handle ? getObjectScreenPoint(handle.mesh) : null;
}

function getAxisCurvePoint(axis, angleDeg) {
  const group = gizmo.userData.axisGroups[axis];
  if (!group) {
    return null;
  }

  const angle = THREE.MathUtils.degToRad(angleDeg);
  tutorialLocalPoint.set(Math.cos(angle), Math.sin(angle), 0);
  group.updateWorldMatrix(true, false);
  tutorialLocalPoint.applyMatrix4(group.matrixWorld);
  return worldToClient(tutorialLocalPoint.clone());
}

function getScreenArcPoint(angleDeg) {
  const group = gizmo.userData.screenGroup;
  if (!group) {
    return null;
  }

  const angle = THREE.MathUtils.degToRad(angleDeg);
  tutorialLocalPoint.set(Math.cos(angle) * 0.98, Math.sin(angle) * 0.98, 0);
  group.updateWorldMatrix(true, false);
  tutorialLocalPoint.applyMatrix4(group.matrixWorld);
  return worldToClient(tutorialLocalPoint.clone());
}

function getScreenPointForScreenButton(controlKey) {
  const button = gizmo.userData.screenButtons.find((item) => item.controlKey === controlKey);
  return button ? getObjectScreenPoint(button.mesh) : null;
}

function getScreenPointForCenterButton(controlKey) {
  const button = gizmo.userData.centerButtons.find((item) => item.controlKey === controlKey);
  return button ? getObjectScreenPoint(button.mesh) : null;
}

function getScreenPointForCenter() {
  return getObjectScreenPoint(gizmo.userData.centerMesh);
}

function getObjectScreenPoint(object) {
  if (!object) {
    return null;
  }

  object.updateWorldMatrix(true, false);
  if (object.isMesh && object.geometry) {
    if (!object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }

    object.geometry.boundingBox.getCenter(tutorialLocalPoint);
    object.localToWorld(tutorialLocalPoint);
    return worldToClient(tutorialLocalPoint.clone());
  }

  return worldToClient(object.getWorldPosition(new THREE.Vector3()));
}

function loadModelFromSource(source, label) {
  state.loaderStatus = "loading";
  state.lastError = "";
  state.meshCount = 0;
  state.currentModelLabel = label;
  setStatus(`Loading ${label}...`, true);

  clearCurrentModel();

  loader.load(
    source,
    (gltf) => {
      initializeLoadedModel(gltf.scene);
    },
    (event) => {
      if (!event.total) {
        return;
      }

      const progress = Math.round((event.loaded / event.total) * 100);
      setStatus(`Loading ${label}... ${progress}%`, true);
    },
    (error) => {
      console.error(error);
      state.loaderStatus = "error";
      state.lastError = error?.message ?? String(error);
      setStatus(`Failed to load ${label}. Try a .glb file or run through a local server.`, true);
    },
  );
}

function clearCurrentModel() {
  scene.attach(modelRoot);
  modelRoot.position.set(0, 0, 0);
  modelRoot.quaternion.identity();
  modelRoot.scale.setScalar(1);

  while (modelRoot.children.length > 0) {
    modelRoot.remove(modelRoot.children[0]);
  }

  state.model = null;
}

function initializeLoadedModel(model) {
  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    state.meshCount += 1;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      material.side = THREE.FrontSide;

      if ("roughness" in material) {
        material.roughness = THREE.MathUtils.clamp(material.roughness * 1.05, 0, 1);
      }

      if ("envMapIntensity" in material) {
        material.envMapIntensity = 0.85;
      }
    }
  });

  const originalBounds = new THREE.Box3().setFromObject(model);
  const center = originalBounds.getCenter(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= originalBounds.min.y;

  modelRoot.add(model);
  state.model = model;

  const normalizedBounds = new THREE.Box3().setFromObject(model);
  const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
  state.baseSize.copy(normalizedSize);
  normalizedBounds.getCenter(state.modelLocalCenter);

  const maxDim = Math.max(normalizedSize.x, normalizedSize.y, normalizedSize.z);

  centerPivotOnModel();
  state.initialTarget.copy(modelCenterWorld);

  controls.minDistance = maxDim * 0.45;
  controls.maxDistance = maxDim * 8;

  camera.near = Math.max(maxDim / 100, 0.05);
  camera.far = Math.max(maxDim * 24, 50);
  state.initialCameraPosition.set(maxDim * 2.8, normalizedSize.y * 1.9, maxDim * 4.9);

  if (!state.hasLoadedModel) {
    camera.position.copy(state.initialCameraPosition);
  }
  camera.updateProjectionMatrix();

  keyLight.shadow.camera.left = -maxDim * 1.6;
  keyLight.shadow.camera.right = maxDim * 1.6;
  keyLight.shadow.camera.top = maxDim * 1.6;
  keyLight.shadow.camera.bottom = -maxDim * 1.6;
  keyLight.shadow.camera.far = maxDim * 9;
  keyLight.shadow.camera.updateProjectionMatrix();

  const shadowSize = Math.max(maxDim * 3.8, 7);
  shadowCatcher.scale.setScalar(shadowSize);

  gizmo.visible = state.gizmoVisible;
  gizmoPickers.visible = state.gizmoVisible;
  updateGizmoButtonLabel();
  updateGizmoAppearance();
  state.loaderStatus = "loaded";
  state.hasLoadedModel = true;
  setStatus(`${state.currentModelLabel} loaded.`);
}

function intersectGizmoControls(event) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(gizmoPickers.children, true);
  return hits[0] ?? null;
}

function intersectPointerPlane(event, planeNormal, target) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);

  dragPlane.setFromNormalAndCoplanarPoint(planeNormal, gizmo.position);
  return raycaster.ray.intersectPlane(dragPlane, target);
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function setHoveredControl(controlKey) {
  if (state.hoveredControl === controlKey) {
    return;
  }

  state.hoveredControl = controlKey;
  updateGizmoAppearance();
}

function updateGizmoAppearance() {
  const activeKey = state.draggingControl?.controlKey ?? state.hoveredControl;

  for (const [axis, handles] of Object.entries(gizmo.userData.axisHandles)) {
    const isActive = activeKey === `axis:${axis}`;
    for (const handle of handles) {
      handle.shell.opacity = isActive ? 0.5 : 0.2;
      handle.head.opacity = isActive ? 0.5 : 0.2;
    }
  }

  for (const [axis, highlight] of Object.entries(gizmo.userData.axisHighlights)) {
    highlight.group.visible = activeKey === `axis:${axis}`;
  }

  const screenActive = activeKey?.startsWith("screen") ?? false;
  const screenHoverOpacity =
    screenActive && state.tutorialRunning
      ? Math.max(gizmoConfig.whiteHoverOpacity, 0.78)
      : gizmoConfig.whiteHoverOpacity;
  gizmo.userData.screenArc.opacity = screenActive ? screenHoverOpacity : gizmoConfig.whiteOpacity;
  gizmo.userData.screenArrowShell.opacity = screenActive ? screenHoverOpacity : gizmoConfig.whiteOpacity;
  gizmo.userData.screenArrowHead.opacity = screenActive ? screenHoverOpacity : gizmoConfig.whiteOpacity;
  for (const button of gizmo.userData.screenButtons) {
    const isActive = activeKey === button.controlKey;
    button.material.opacity = isActive ? 0.68 : 0.28;
  }

  const centerActive = activeKey === "scale";
  gizmo.userData.centerFill.material.opacity = centerActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;
  gizmo.userData.centerOutline.opacity = centerActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;
  gizmo.userData.centerGlyph.opacity = centerActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;

  for (const button of gizmo.userData.centerButtons) {
    const isActive = activeKey === button.controlKey;
    button.fill.opacity = isActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;
    button.outline.opacity = isActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;
    button.glyph.opacity = isActive ? SCALE_UI_HOVER_OPACITY : SCALE_UI_OPACITY;
  }

  for (const pickers of Object.values(gizmoPickers.userData.axisPickers)) {
    for (const picker of pickers) {
      const isActive = activeKey === picker.userData.controlKey;
      picker.material.opacity = isActive ? 0.16 : 0.001;
    }
  }

  for (const picker of gizmoPickers.userData.screenPickers) {
    const isActive = activeKey === picker.userData.controlKey;
    picker.material.opacity = isActive ? 0.14 : 0.001;
  }

  gizmoPickers.userData.centerPicker.material.opacity = centerActive ? 0.18 : 0.001;
  for (const picker of gizmoPickers.userData.centerButtons) {
    const isActive = activeKey === picker.userData.controlKey;
    picker.material.opacity = isActive ? 0.18 : 0.001;
  }
}

function createRotationGizmo() {
  const root = new THREE.Group();
  const billboard = new THREE.Group();
  const axisHandles = {};
  const axisHighlights = {};

  axisHandles.x = createAxisHandlePair("x", 0xff4c62, [
    { startDeg: 22, endDeg: 118, direction: -1 },
    { startDeg: 202, endDeg: 298, direction: 1 },
  ]);
  axisHandles.y = createAxisHandlePair("y", 0x30ff7a, [
    { startDeg: 146, endDeg: 232, direction: -1 },
    { startDeg: -52, endDeg: 34, direction: 1 },
  ]);
  axisHandles.z = createAxisHandlePair("z", 0x2f59ff, [
    { startDeg: 132, endDeg: 222, direction: -1 },
    { startDeg: -42, endDeg: 48, direction: 1 },
  ]);

  root.add(axisHandles.x.group);
  root.add(axisHandles.y.group);
  root.add(axisHandles.z.group);

  axisHighlights.x = createAxisHighlight("x");
  axisHighlights.y = createAxisHighlight("y");
  axisHighlights.z = createAxisHighlight("z");
  root.add(axisHighlights.x.group);
  root.add(axisHighlights.y.group);
  root.add(axisHighlights.z.group);

  const screenArc = createScreenArc();
  billboard.add(screenArc.group);
  const screenButtons = createScreenButtons();
  billboard.add(screenButtons.group);

  const centerControl = createCenterControl();
  billboard.add(centerControl.group);

  root.add(billboard);

  root.userData.billboard = billboard;
  root.userData.axisHandles = {
    x: axisHandles.x.handles,
    y: axisHandles.y.handles,
    z: axisHandles.z.handles,
  };
  root.userData.axisGroups = {
    x: axisHandles.x.group,
    y: axisHandles.y.group,
    z: axisHandles.z.group,
  };
  root.userData.axisHighlights = axisHighlights;
  root.userData.screenArc = screenArc.arc;
  root.userData.screenArrowShell = screenArc.shell;
  root.userData.screenArrowHead = screenArc.head;
  root.userData.screenGroup = screenArc.group;
  root.userData.screenButtons = screenButtons.buttons;
  root.userData.screenButtonsGroup = screenButtons.group;
  root.userData.centerFill = centerControl.fill;
  root.userData.centerMesh = centerControl.fillMesh;
  root.userData.centerOutline = centerControl.outline;
  root.userData.centerGlyph = centerControl.glyph;
  root.userData.centerButtons = centerControl.buttons;
  root.userData.centerGroup = centerControl.group;
  return root;
}

function createGizmoPickers() {
  const root = new THREE.Group();
  const billboard = new THREE.Group();
  const axisPickers = {
    x: createAxisPickerPair("x", [
      { startDeg: 22, endDeg: 118, direction: -1 },
      { startDeg: 202, endDeg: 298, direction: 1 },
    ]),
    y: createAxisPickerPair("y", [
      { startDeg: 146, endDeg: 232, direction: -1 },
      { startDeg: -52, endDeg: 34, direction: 1 },
    ]),
    z: createAxisPickerPair("z", [
      { startDeg: 132, endDeg: 222, direction: -1 },
      { startDeg: -42, endDeg: 48, direction: 1 },
    ]),
  };

  root.add(axisPickers.x.group);
  root.add(axisPickers.y.group);
  root.add(axisPickers.z.group);

  const screenPickers = createScreenPickers();

  const centerPicker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  centerPicker.userData = { type: "scale", controlKey: "scale", direction: 0 };

  const centerButtons = createCenterButtonPickers();

  billboard.add(screenPickers.group);
  billboard.add(centerPicker);
  billboard.add(centerButtons.group);
  root.add(billboard);

  root.userData.billboard = billboard;
  root.userData.axisPickers = {
    x: axisPickers.x.pickers,
    y: axisPickers.y.pickers,
    z: axisPickers.z.pickers,
  };
  root.userData.axisGroups = {
    x: axisPickers.x.group,
    y: axisPickers.y.group,
    z: axisPickers.z.group,
  };
  root.userData.screenPickers = screenPickers.pickers;
  root.userData.screenPickerGroup = screenPickers.group;
  root.userData.centerPicker = centerPicker;
  root.userData.centerButtons = centerButtons.pickers;
  root.userData.centerButtonsGroup = centerButtons.group;
  return root;
}

function createPickerMesh(geometry, userData) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  mesh.userData = userData;
  return mesh;
}

function createAxisHandlePair(axis, color, arcs) {
  const group = new THREE.Group();
  const handles = arcs.map((arc) => {
    const handle = createFlatArcHandle(color, arc.startDeg, arc.endDeg, 0.2);
    group.add(handle.group);
    return {
      ...handle,
      direction: arc.direction,
      axis,
    };
  });

  orientAxisGroup(group, axis);
  return { group, handles };
}

function createAxisPickerPair(axis, arcs) {
  const group = new THREE.Group();
  const pickers = arcs.map((arc) => {
    const picker = createPickerMesh(
      createFlatArcArrowGeometry(arc.startDeg, arc.endDeg, 0.78, 1.06, 0.2),
      { type: "axis", axis, controlKey: `axis:${axis}`, direction: arc.direction },
    );
    group.add(picker);
    return picker;
  });

  orientAxisGroup(group, axis);
  return { group, pickers };
}

function createAxisHighlight(axis) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    createFlatRingBandGeometry(0.82, 1.02),
    new THREE.MeshStandardMaterial({
      color: 0xdcd5ce,
      transparent: true,
      opacity: 0.34,
      roughness: 0.42,
      metalness: 0.02,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 27;
  group.add(mesh);
  orientAxisGroup(group, axis);
  group.visible = false;
  return { group, mesh };
}

function createScreenArc() {
  return createFlatArcHandle(0xf2efe9, 208, 486, 0.22, {
    innerRadius: 0.94,
    outerRadius: 1.02,
    depthTest: false,
    headLength: 0.2,
    forceArrow: true,
  });
}

function createScreenButtons() {
  const group = new THREE.Group();
  const top = createScreenButton(-1, "screen:-1");
  top.position.set(-0.05, 0.98, 0.002);
  top.rotation.z = Math.PI;
  const bottom = createScreenButton(1, "screen:1");
  bottom.position.set(-0.04, -0.98, 0.002);

  group.add(top);
  group.add(bottom);
  return {
    group,
    buttons: [
      { mesh: top, material: top.material, controlKey: "screen:-1" },
      { mesh: bottom, material: bottom.material, controlKey: "screen:1" },
    ],
  };
}

function createScreenButton(direction, controlKey) {
  const mesh = new THREE.Mesh(
    createScreenButtonGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0xf2efe9,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.userData = { type: "screen", controlKey, direction };
  mesh.renderOrder = 33;
  return mesh;
}

function createScreenPickers() {
  const group = new THREE.Group();
  const arc = createPickerMesh(createFlatArcArrowGeometry(208, 486, 0.84, 1.08, 0.22), {
    type: "screen",
    controlKey: "screen:arc",
  });
  arc.renderOrder = 26;

  const top = createPickerMesh(createScreenButtonGeometry(1.6), {
    type: "screen",
    controlKey: "screen:-1",
    direction: -1,
  });
  top.position.set(-0.05, 0.98, 0.002);
  top.rotation.z = Math.PI;

  const bottom = createPickerMesh(createScreenButtonGeometry(1.6), {
    type: "screen",
    controlKey: "screen:1",
    direction: 1,
  });
  bottom.position.set(-0.04, -0.98, 0.002);

  group.add(arc);
  group.add(top);
  group.add(bottom);
  return { group, pickers: [arc, top, bottom] };
}

function createScreenButtonGeometry(scale = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.08 * scale, -0.015 * scale);
  shape.lineTo(0.035 * scale, -0.015 * scale);
  shape.lineTo(0.035 * scale, -0.05 * scale);
  shape.lineTo(0.13 * scale, 0);
  shape.lineTo(0.035 * scale, 0.05 * scale);
  shape.lineTo(0.035 * scale, 0.015 * scale);
  shape.lineTo(-0.08 * scale, 0.015 * scale);
  return new THREE.ShapeGeometry(shape, 8);
}

function createFlatArcHandle(color, startDeg, endDeg, opacity, options = {}) {
  const group = new THREE.Group();
  const shellMaterial = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.34,
    metalness: 0.04,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
    emissive: new THREE.Color(color).multiplyScalar(0.05),
    side: THREE.DoubleSide,
  });

  const shell = new THREE.Mesh(
    createFlatArcArrowGeometry(
      startDeg,
      endDeg,
      options.innerRadius ?? 0.84,
      options.outerRadius ?? 1.02,
      options.forceArrow ? (options.headLength ?? 0.18) : (gizmoConfig.handleShape === "arrow" ? (options.headLength ?? 0.18) : 0),
    ),
    shellMaterial,
  );
  shell.renderOrder = 28;
  group.add(shell);
  return {
    group,
    mesh: shell,
    arc: shell.material,
    shell: shell.material,
    head: shell.material,
  };
}

function createFlatArcArrowGeometry(startDeg, endDeg, innerRadius, outerRadius, headLength) {
  let normalizedStart = startDeg;
  let normalizedEnd = endDeg;

  while (normalizedEnd <= normalizedStart) {
    normalizedEnd += 360;
  }

  const startAngle = THREE.MathUtils.degToRad(normalizedStart);
  const endAngle = THREE.MathUtils.degToRad(normalizedEnd);
  const steps = Math.max(20, Math.round((normalizedEnd - normalizedStart) / 4));
  const outerPoints = [];
  const innerPoints = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, index / steps);
    outerPoints.push(new THREE.Vector2(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius));
    innerPoints.push(new THREE.Vector2(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius));
  }

  const tangent = new THREE.Vector2(-Math.sin(endAngle), Math.cos(endAngle)).normalize();
  const midRadius = (innerRadius + outerRadius) * 0.5;
  const tip = new THREE.Vector2(Math.cos(endAngle) * midRadius, Math.sin(endAngle) * midRadius).addScaledVector(tangent, headLength);

  const shape = new THREE.Shape([...outerPoints, tip, ...innerPoints.reverse()]);
  return new THREE.ShapeGeometry(shape, 48);
}

function createFlatRingBandGeometry(innerRadius, outerRadius) {
  const shape = new THREE.Shape().absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path().absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 96);
}

function orientAxisGroup(group, axis) {
  if (axis === "x") {
    group.rotation.y = Math.PI / 2;
  } else if (axis === "y") {
    group.rotation.x = -Math.PI / 2;
  }
}

function createCenterControl() {
  const group = new THREE.Group();
  const size = 0.32;
  const halfSize = size / 2;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      color: 0x171717,
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  fill.renderOrder = 41;
  group.add(fill);

  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfSize, -halfSize, 0.001),
      new THREE.Vector3(halfSize, -halfSize, 0.001),
      new THREE.Vector3(halfSize, halfSize, 0.001),
      new THREE.Vector3(-halfSize, halfSize, 0.001),
    ]),
    makeLineMaterial(0xf0ebe3, 0.64),
  );
  outline.renderOrder = 42;
  group.add(outline);

  const glyph = new THREE.LineSegments(createCenterGlyphGeometry(), makeLineMaterial(0xf4efe8, 0.86));
  glyph.renderOrder = 43;
  glyph.position.z = 0.002;
  group.add(glyph);

  const plusButton = createCenterScaleButton("scale:plus", 1);
  plusButton.group.position.set(0.2, 0.2, 0.003);
  group.add(plusButton.group);

  const minusButton = createCenterScaleButton("scale:minus", -1);
  minusButton.group.position.set(-0.2, -0.2, 0.003);
  group.add(minusButton.group);

  return {
    group,
    fill,
    fillMesh: fill,
    outline: outline.material,
    glyph: glyph.material,
    buttons: [plusButton, minusButton],
  };
}

function createCenterGlyphGeometry() {
  const points = [
    new THREE.Vector3(-0.09, 0.09, 0),
    new THREE.Vector3(-0.09, 0.02, 0),
    new THREE.Vector3(-0.09, 0.09, 0),
    new THREE.Vector3(-0.02, 0.09, 0),
    new THREE.Vector3(0.025, -0.09, 0),
    new THREE.Vector3(0.09, -0.09, 0),
    new THREE.Vector3(0.09, -0.09, 0),
    new THREE.Vector3(0.09, -0.025, 0),
    new THREE.Vector3(-0.04, -0.04, 0),
    new THREE.Vector3(-0.04, 0.03, 0),
    new THREE.Vector3(-0.04, -0.04, 0),
    new THREE.Vector3(0.03, -0.04, 0),
    new THREE.Vector3(0.04, 0.04, 0),
    new THREE.Vector3(0.08, 0.08, 0),
    new THREE.Vector3(0.08, 0.08, 0),
    new THREE.Vector3(0.055, 0.08, 0),
    new THREE.Vector3(0.08, 0.08, 0),
    new THREE.Vector3(0.08, 0.055, 0),
    new THREE.Vector3(-0.005, -0.005, 0),
    new THREE.Vector3(0.062, 0.062, 0),
  ];
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createCenterScaleButton(controlKey, direction) {
  const group = new THREE.Group();
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.125, 0.125),
    new THREE.MeshBasicMaterial({
      color: 0x131313,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  fill.renderOrder = 44;
  group.add(fill);

  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.0625, -0.0625, 0.001),
      new THREE.Vector3(0.0625, -0.0625, 0.001),
      new THREE.Vector3(0.0625, 0.0625, 0.001),
      new THREE.Vector3(-0.0625, 0.0625, 0.001),
    ]),
    makeLineMaterial(0xf0ebe3, 0.86),
  );
  outline.renderOrder = 45;
  group.add(outline);

  const glyph = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(
      direction > 0
        ? [
            new THREE.Vector3(-0.03, 0, 0.002),
            new THREE.Vector3(0.03, 0, 0.002),
            new THREE.Vector3(0, -0.03, 0.002),
            new THREE.Vector3(0, 0.03, 0.002),
          ]
        : [new THREE.Vector3(-0.03, 0, 0.002), new THREE.Vector3(0.03, 0, 0.002)],
    ),
    makeLineMaterial(0xf4efe8, 0.86),
  );
  glyph.renderOrder = 46;
  group.add(glyph);

  group.userData = { type: "scale", controlKey, direction };
  return {
    group,
    mesh: fill,
    fill: fill.material,
    outline: outline.material,
    glyph: glyph.material,
    controlKey,
  };
}

function createCenterButtonPickers() {
  const group = new THREE.Group();
  const plus = createPickerMesh(new THREE.PlaneGeometry(0.18, 0.18), {
    type: "scale",
    controlKey: "scale:plus",
    direction: 1,
  });
  plus.position.set(0.2, 0.2, 0.003);

  const minus = createPickerMesh(new THREE.PlaneGeometry(0.18, 0.18), {
    type: "scale",
    controlKey: "scale:minus",
    direction: -1,
  });
  minus.position.set(-0.2, -0.2, 0.003);

  group.add(plus);
  group.add(minus);
  return { group, pickers: [plus, minus] };
}

function makeLineMaterial(color, opacity) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function updateGizmo() {
  if (!gizmo.visible) {
    return;
  }

  transformPivot.getWorldPosition(worldPivot);
  gizmo.position.copy(worldPivot);
  gizmoPickers.position.copy(worldPivot);
  gizmo.userData.billboard.quaternion.copy(camera.quaternion);
  gizmoPickers.userData.billboard.quaternion.copy(camera.quaternion);

  const halfX = state.baseSize.x * modelRoot.scale.x * 0.5;
  const halfY = state.baseSize.y * modelRoot.scale.y * 0.5;
  const halfZ = state.baseSize.z * modelRoot.scale.z * 0.5;
  const maxHalf = Math.max(halfX, halfY, halfZ);
  const rawPadding = Math.max(maxHalf * gizmoConfig.offsetMultiplier, 0.18);
  const viewAtPivot = getViewportSizeAtPosition(worldPivot);
  const maxGizmoRadius = Math.min(viewAtPivot.x, viewAtPivot.y) * GIZMO_SCREEN_FIT;
  const padding = Math.min(rawPadding, Math.max(maxGizmoRadius - maxHalf, 0.08));

  const radiusX = halfX + padding;
  const radiusY = halfY + padding;
  const radiusZ = halfZ + padding;
  const whiteRadius = Math.min(
    Math.max(radiusX, radiusY, radiusZ) + padding * 0.62,
    maxGizmoRadius,
  );

  gizmo.userData.axisGroups.y.position.set(0, -halfY + Math.max(padding * 0.2, 0.035), 0);
  gizmoPickers.userData.axisGroups.y.position.copy(gizmo.userData.axisGroups.y.position);
  gizmo.userData.axisGroups.y.scale.set(radiusX, radiusZ, 1);
  gizmoPickers.userData.axisGroups.y.scale.copy(gizmo.userData.axisGroups.y.scale);
  gizmo.userData.axisHighlights.y.group.position.copy(gizmo.userData.axisGroups.y.position);
  gizmo.userData.axisHighlights.y.group.scale.copy(gizmo.userData.axisGroups.y.scale);

  gizmo.userData.axisGroups.z.position.set(0, 0, 0);
  gizmoPickers.userData.axisGroups.z.position.set(0, 0, 0);
  gizmo.userData.axisGroups.z.scale.set(radiusX, radiusY, 1);
  gizmoPickers.userData.axisGroups.z.scale.copy(gizmo.userData.axisGroups.z.scale);
  gizmo.userData.axisHighlights.z.group.position.set(0, 0, 0);
  gizmo.userData.axisHighlights.z.group.scale.copy(gizmo.userData.axisGroups.z.scale);

  gizmo.userData.axisGroups.x.position.set(0, 0, 0);
  gizmoPickers.userData.axisGroups.x.position.set(0, 0, 0);
  gizmo.userData.axisGroups.x.scale.set(radiusZ, radiusY, 1);
  gizmoPickers.userData.axisGroups.x.scale.copy(gizmo.userData.axisGroups.x.scale);
  gizmo.userData.axisHighlights.x.group.position.set(0, 0, 0);
  gizmo.userData.axisHighlights.x.group.scale.copy(gizmo.userData.axisGroups.x.scale);

  gizmo.userData.screenGroup.scale.setScalar(whiteRadius);
  gizmo.userData.screenButtonsGroup.scale.setScalar(whiteRadius);
  gizmoPickers.userData.screenPickerGroup.scale.setScalar(whiteRadius);

  const centerScale = getWorldUnitsForPixels(CENTER_CONTROL_PIXELS, worldPivot);
  const centerPickerScale = getWorldUnitsForPixels(CENTER_PICKER_PIXELS, worldPivot);
  const centerForwardOffset = getWorldUnitsForPixels(CENTER_FORWARD_PIXELS, worldPivot);

  let centerYOffset = 0;
  if (state.scaleLayout === "v2") {
    const v2OffsetFactor = maxHalf < 0.16 ? 0.9 : maxHalf < 0.32 ? 0.82 : 0.72;
    centerYOffset = -whiteRadius * v2OffsetFactor;
  }

  gizmo.userData.centerGroup.scale.setScalar(centerScale);
  gizmo.userData.centerGroup.position.set(0, centerYOffset, centerForwardOffset);
  gizmoPickers.userData.centerPicker.scale.setScalar(centerPickerScale);
  gizmoPickers.userData.centerPicker.position.set(0, centerYOffset, centerForwardOffset);
  gizmoPickers.userData.centerButtonsGroup.scale.setScalar(centerScale);
  gizmoPickers.userData.centerButtonsGroup.position.set(0, centerYOffset, centerForwardOffset);
}

function getWorldUnitsForPixels(pixelSize, referencePosition) {
  const distance = camera.position.distanceTo(referencePosition);
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
  return (pixelSize / sizes.height) * viewportHeight;
}

function getViewportSizeAtPosition(referencePosition) {
  const distance = camera.position.distanceTo(referencePosition);
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
  viewportSize.set(height * camera.aspect, height);
  return viewportSize;
}

function clampScaleToView(desiredScale) {
  if (!state.model) {
    return THREE.MathUtils.clamp(desiredScale, MIN_MODEL_SCALE, MAX_MODEL_SCALE);
  }

  transformPivot.getWorldPosition(worldPivot);

  const currentScale = Math.max(modelRoot.scale.x, 0.0001);
  const maxScaleByScreen = getMaxScaleForScreen(currentScale);
  const maxScaleByGizmo = getMaxScaleForGizmo();
  const maxAllowedScale = Math.max(
    MIN_MODEL_SCALE,
    Math.min(MAX_MODEL_SCALE, maxScaleByScreen, maxScaleByGizmo),
  );

  return THREE.MathUtils.clamp(desiredScale, MIN_MODEL_SCALE, maxAllowedScale);
}

function getMaxScaleForScreen(currentScale) {
  debugBounds.setFromObject(modelRoot);
  const projected = getProjectedBoundsForBox(debugBounds);

  if (projected.width <= 0 || projected.height <= 0) {
    return MAX_MODEL_SCALE;
  }

  const maxScaleX = currentScale * (MODEL_SCREEN_FIT / projected.width);
  const maxScaleY = currentScale * (MODEL_SCREEN_FIT / projected.height);
  return Math.min(maxScaleX, maxScaleY);
}

function getMaxScaleForGizmo() {
  debugBounds.setFromObject(modelRoot);
  debugBounds.getSize(debugSize);

  const currentScale = Math.max(modelRoot.scale.x, 0.0001);
  const unscaledMaxHalf = Math.max(debugSize.x, debugSize.y, debugSize.z) / (2 * currentScale);
  const viewAtPivot = getViewportSizeAtPosition(worldPivot);
  const maxGizmoRadius = Math.min(viewAtPivot.x, viewAtPivot.y) * GIZMO_SCREEN_FIT;

  let low = MIN_MODEL_SCALE;
  let high = MAX_MODEL_SCALE;

  for (let index = 0; index < 18; index += 1) {
    const mid = (low + high) * 0.5;
    const maxHalf = unscaledMaxHalf * mid;
    const padding = Math.max(maxHalf * gizmoConfig.offsetMultiplier, 0.18);
    const whiteRadius = maxHalf + padding * 1.62;

    if (whiteRadius <= maxGizmoRadius) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

function getProjectedBoundsForBox(box) {
  projectedMin.set(Infinity, Infinity);
  projectedMax.set(-Infinity, -Infinity);

  const corners = [
    [box.min.x, box.min.y, box.min.z],
    [box.min.x, box.min.y, box.max.z],
    [box.min.x, box.max.y, box.min.z],
    [box.min.x, box.max.y, box.max.z],
    [box.max.x, box.min.y, box.min.z],
    [box.max.x, box.min.y, box.max.z],
    [box.max.x, box.max.y, box.min.z],
    [box.max.x, box.max.y, box.max.z],
  ];

  for (const corner of corners) {
    projectedCorner.set(corner[0], corner[1], corner[2]).project(camera);
    projectedMin.x = Math.min(projectedMin.x, projectedCorner.x);
    projectedMin.y = Math.min(projectedMin.y, projectedCorner.y);
    projectedMax.x = Math.max(projectedMax.x, projectedCorner.x);
    projectedMax.y = Math.max(projectedMax.y, projectedCorner.y);
  }

  return {
    width: (projectedMax.x - projectedMin.x) * 0.5,
    height: (projectedMax.y - projectedMin.y) * 0.5,
  };
}

function bindConstructorUI() {
  if (!whiteOpacityInput || !whiteHoverInput || !gizmoOffsetInput || !handleShapeInput) {
    return;
  }

  whiteOpacityInput.value = String(gizmoConfig.whiteOpacity);
  whiteHoverInput.value = String(gizmoConfig.whiteHoverOpacity);
  gizmoOffsetInput.value = String(gizmoConfig.offsetMultiplier);
  handleShapeInput.value = gizmoConfig.handleShape;

  whiteOpacityInput.addEventListener("input", () => {
    gizmoConfig.whiteOpacity = Number(whiteOpacityInput.value);
    updateGizmoAppearance();
  });

  whiteHoverInput.addEventListener("input", () => {
    gizmoConfig.whiteHoverOpacity = Number(whiteHoverInput.value);
    updateGizmoAppearance();
  });

  gizmoOffsetInput.addEventListener("input", () => {
    gizmoConfig.offsetMultiplier = Number(gizmoOffsetInput.value);
  });

  handleShapeInput.addEventListener("change", () => {
    gizmoConfig.handleShape = handleShapeInput.value;
    rebuildGizmo();
  });
}

function rebuildGizmo() {
  const shouldBeVisible = state.gizmoVisible && Boolean(state.model);

  scene.remove(gizmo);
  scene.remove(gizmoPickers);

  gizmo = createRotationGizmo();
  gizmo.visible = shouldBeVisible;
  scene.add(gizmo);

  gizmoPickers = createGizmoPickers();
  gizmoPickers.visible = shouldBeVisible;
  scene.add(gizmoPickers);

  updateGizmoAppearance();
}

function updateDebug() {
  const lines = [];
  lines.push(`protocol: ${window.location.protocol}`);
  lines.push(`loader: ${state.loaderStatus}`);
  lines.push(`error: ${state.lastError || "-"}`);
  lines.push(`model loaded: ${Boolean(state.model)}`);
  lines.push(`mesh count: ${state.meshCount}`);
  lines.push(`dragging: ${state.draggingControl?.controlKey ?? "-"}`);
  lines.push(`hover: ${state.hoveredControl ?? "-"}`);

  if (state.model) {
    debugBounds.setFromObject(modelRoot);
    debugBounds.getSize(debugSize);
    debugBounds.getCenter(debugCenter);

    lines.push(`bbox size: ${vec3(debugSize)}`);
    lines.push(`bbox center(world): ${vec3(debugCenter)}`);
    lines.push(`pivot(world): ${vec3(worldPivot)}`);
    lines.push(`modelRoot scale: ${vec3(modelRoot.scale)}`);
    lines.push(`modelRoot pos: ${vec3(modelRoot.position)}`);
    lines.push(`camera pos: ${vec3(camera.position)}`);
    lines.push(`camera target: ${vec3(controls.target)}`);
  } else {
  }

  if (window.location.protocol === "file:") {
    lines.push("note: file:// can behave inconsistently in embedded browsers");
  }

  debugNode.textContent = lines.join("\n");
}

function vec3(vector) {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function render() {
  controls.update();
  updateGizmo();
  updateDebug();
  renderer.render(scene, camera);

  window.requestAnimationFrame(render);
}

render();
