export const settings = {
  snapBackDuration: 300,
  maxTilt: 5,
  bouncePower: 0.2,
  swipeThreshold: 300, // px/s
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getElementSize = (element: HTMLElement) => {
  const elementStyles = window.getComputedStyle(element);
  const widthString = elementStyles.getPropertyValue("width");
  const width = Number(widthString.split("px")[0]);
  const heightString = elementStyles.getPropertyValue("height");
  const height = Number(heightString.split("px")[0]);
  return { x: width, y: height };
};

export const pythagoras = (x: number, y: number) => {
  return Math.sqrt(x ** 2 + y ** 2);
};

export const normalize = (vector: { x: number; y: number }, multiplier = 1) => {
  const length = Math.sqrt(vector.x ** 2 + vector.y ** 2);
  return { x: (vector.x * multiplier) / length, y: (vector.y * multiplier) / length };
};

export const animateOut = async (element: HTMLElement, speed: { x: number; y: number }, easeIn = false) => {
  const startPos = getTranslate(element);
  const bodySize = getElementSize(document.body);
  const diagonal = pythagoras(bodySize.x, bodySize.y);

  const velocity = pythagoras(speed.x, speed.y);
  const time = diagonal / velocity;
  const multiplier = diagonal / velocity;

  const translateString = translationString(speed.x * multiplier + startPos.x, -speed.y * multiplier + startPos.y);
  let rotateString = "";

  const rotationPower = 200;

  if (easeIn) element.style.transition = `ease ${time}s`;
  else element.style.transition = `ease-out ${time}s`;

  if (getRotation(element) === 0) rotateString = rotationString((Math.random() - 0.5) * rotationPower);
  else if (getRotation(element) > 0)
    rotateString = rotationString((Math.random() * rotationPower) / 2 + getRotation(element));
  else rotateString = rotationString(((Math.random() - 1) * rotationPower) / 2 + getRotation(element));

  element.style.transform = translateString + rotateString;

  await sleep(time * 1000);
};

export const animateBack = async (element: HTMLElement) => {
  element.style.transition = `${settings.snapBackDuration}ms`;
  const startingPoint = getTranslate(element);
  const translation = translationString(
    startingPoint.x * -settings.bouncePower,
    startingPoint.y * -settings.bouncePower,
  );
  const rotation = rotationString(getRotation(element) * -settings.bouncePower);
  element.style.transform = translation + rotation;

  await sleep(settings.snapBackDuration * 0.75);
  element.style.transform = "none";

  await sleep(settings.snapBackDuration);
  element.style.transition = "10ms";
};

export const getSwipeDirection = (property: { x: number; y: number }) => {
  if (Math.abs(property.x) > Math.abs(property.y)) {
    if (property.x > settings.swipeThreshold) return "right";
    else if (property.x < -settings.swipeThreshold) return "left";
  } else {
    if (property.y > settings.swipeThreshold) return "up";
    else if (property.y < -settings.swipeThreshold) return "down";
  }
  return "none";
};

export const calcSpeed = (
  oldLocation: { x: number; y: number; time: number },
  newLocation: { x: number; y: number; time: number },
) => {
  const dx = newLocation.x - oldLocation.x;
  const dy = oldLocation.y - newLocation.y;
  const dt = (newLocation.time - oldLocation.time) / 1000;
  return { x: dx / dt, y: dy / dt };
};

export const translationString = (x: number, y: number) => {
  const translation = `translate(${x}px, ${y}px)`;
  return translation;
};

export const rotationString = (rot: number) => {
  const rotation = `rotate(${rot}deg)`;
  return rotation;
};

export const getTranslate = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.transform);
  const ans = { x: matrix.m41, y: -matrix.m42 };
  return ans;
};

export const getRotation = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.transform);
  const ans = (-Math.asin(matrix.m21) / (2 * Math.PI)) * 360;
  return ans;
};

export const dragableTouchmove = (
  coordinates: { x: number; y: number },
  element: HTMLElement,
  offset: { x: number; y: number },
  lastLocation: { x: number; y: number; time: number },
) => {
  const pos = { x: coordinates.x + offset.x, y: coordinates.y + offset.y };
  const newLocation = { x: pos.x, y: pos.y, time: new Date().getTime() };
  const translation = translationString(pos.x, pos.y);
  const rotCalc = calcSpeed(lastLocation, newLocation).x / 1000;
  const rotation = rotationString(rotCalc * settings.maxTilt);
  element.style.transform = translation + rotation;
  return newLocation;
};

export const touchCoordinatesFromEvent = (e: TouchEvent) => {
  const touchLocation = e.targetTouches[0];
  return { x: touchLocation.clientX, y: touchLocation.clientY };
};

export const mouseCoordinatesFromEvent = (e: MouseEvent) => {
  return { x: e.clientX, y: e.clientY };
};
