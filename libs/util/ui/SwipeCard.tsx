"use client";
import { clsx } from "@akanjs/client";
import React, { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef } from "react";

type Direction = "left" | "right" | "up" | "down" | "none";
type SwipeHandler = (direction: Direction) => void;
type CardLeftScreenHandler = (direction: Direction) => void;
type SwipeRequirementFulfillUpdate = (direction: Direction) => void;
type SwipeRequirementUnfulfillUpdate = () => void;

interface API {
  swipe(dir?: Direction): Promise<void>;
  restoreCard(): Promise<void>;
}

interface Props {
  flickOnSwipe?: boolean;
  onSwipe?: SwipeHandler;
  onCardLeftScreen?: CardLeftScreenHandler;
  preventSwipe?: string[];
  swipeRequirementType?: "velocity" | "position";
  swipeThreshold?: number;
  onSwipeRequirementFulfilled?: SwipeRequirementFulfillUpdate;
  onSwipeRequirementUnfulfilled?: SwipeRequirementUnfulfillUpdate;
  className?: string;
  children?: React.ReactNode;
}

const settings = {
  snapBackDuration: 300,
  maxTilt: 5,
  bouncePower: 0.2,
  swipeThreshold: 300, // px/s
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getElementSize = (element: HTMLElement) => {
  const elementStyles = window.getComputedStyle(element);
  const widthString = elementStyles.getPropertyValue("width");
  const width = Number(widthString.split("px")[0]);
  const heightString = elementStyles.getPropertyValue("height");
  const height = Number(heightString.split("px")[0]);
  return { x: width, y: height };
};

const pythagoras = (x: number, y: number) => {
  return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
};

const normalize = (vector: { x: number; y: number }, multiplier = 1) => {
  const length = Math.sqrt(Math.pow(vector.x, 2) + Math.pow(vector.y, 2));
  return { x: (vector.x * multiplier) / length, y: (vector.y * multiplier) / length };
};

const animateOut = async (element: HTMLElement, speed: { x: number; y: number }, easeIn = false) => {
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

const animateBack = async (element: HTMLElement) => {
  element.style.transition = `${settings.snapBackDuration}ms`;
  const startingPoint = getTranslate(element);
  const translation = translationString(
    startingPoint.x * -settings.bouncePower,
    startingPoint.y * -settings.bouncePower
  );
  const rotation = rotationString(getRotation(element) * -settings.bouncePower);
  element.style.transform = translation + rotation;

  await sleep(settings.snapBackDuration * 0.75);
  element.style.transform = "none";

  await sleep(settings.snapBackDuration);
  element.style.transition = "10ms";
};

const getSwipeDirection = (property: { x: number; y: number }) => {
  if (Math.abs(property.x) > Math.abs(property.y)) {
    if (property.x > settings.swipeThreshold) return "right";
    else if (property.x < -settings.swipeThreshold) return "left";
  } else {
    if (property.y > settings.swipeThreshold) return "up";
    else if (property.y < -settings.swipeThreshold) return "down";
  }
  return "none";
};

const calcSpeed = (
  oldLocation: { x: number; y: number; time: number },
  newLocation: { x: number; y: number; time: number }
) => {
  const dx = newLocation.x - oldLocation.x;
  const dy = oldLocation.y - newLocation.y;
  const dt = (newLocation.time - oldLocation.time) / 1000;
  return { x: dx / dt, y: dy / dt };
};

const translationString = (x: number, y: number) => {
  const translation = `translate(${x}px, ${y}px)`;
  return translation;
};

const rotationString = (rot: number) => {
  const rotation = `rotate(${rot}deg)`;
  return rotation;
};

const getTranslate = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.transform);
  const ans = { x: matrix.m41, y: -matrix.m42 };
  return ans;
};

const getRotation = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const matrix = new WebKitCSSMatrix(style.transform);
  const ans = (-Math.asin(matrix.m21) / (2 * Math.PI)) * 360;
  return ans;
};

const dragableTouchmove = (
  coordinates: { x: number; y: number },
  element: HTMLElement,
  offset: { x: number; y: number },
  lastLocation: { x: number; y: number; time: number }
) => {
  const pos = { x: coordinates.x + offset.x, y: coordinates.y + offset.y };
  const newLocation = { x: pos.x, y: pos.y, time: new Date().getTime() };
  const translation = translationString(pos.x, pos.y);
  const rotCalc = calcSpeed(lastLocation, newLocation).x / 1000;
  const rotation = rotationString(rotCalc * settings.maxTilt);
  element.style.transform = translation + rotation;
  return newLocation;
};

const touchCoordinatesFromEvent = (e: TouchEvent) => {
  const touchLocation = e.targetTouches[0];
  return { x: touchLocation.clientX, y: touchLocation.clientY };
};

const mouseCoordinatesFromEvent = (e: MouseEvent) => {
  return { x: e.clientX, y: e.clientY };
};

export const SwipeCard = memo(
  forwardRef<API, Props>(
    (
      {
        flickOnSwipe = true,
        children,
        onSwipe,
        onCardLeftScreen,
        className,
        preventSwipe = [],
        swipeRequirementType = "velocity",
        swipeThreshold = settings.swipeThreshold,
        onSwipeRequirementFulfilled,
        onSwipeRequirementUnfulfilled,
      },
      ref
    ) => {
      settings.swipeThreshold = swipeThreshold;
      const swipeAlreadyReleased = useRef(false);
      const element = useRef<HTMLDivElement>(null);
      useImperativeHandle(ref, () => ({
        async swipe(dir = "right") {
          if (!element.current) return;
          if (onSwipe) onSwipe(dir);
          const power = 1000;
          const disturbance = (Math.random() - 0.5) * 100;
          if (dir === "right") await animateOut(element.current, { x: power, y: disturbance }, true);
          else if (dir === "left") await animateOut(element.current, { x: -power, y: disturbance }, true);
          else if (dir === "up") await animateOut(element.current, { x: disturbance, y: power }, true);
          else if (dir === "down") await animateOut(element.current, { x: disturbance, y: -power }, true);

          element.current.style.display = "none";
          if (onCardLeftScreen) onCardLeftScreen(dir as Direction);
        },
        async restoreCard() {
          if (element.current) {
            element.current.style.display = "block";
            await animateBack(element.current);
          }
        },
      }));

      const handleSwipeReleased = useCallback(
        async (element: HTMLElement, speed: { x: number; y: number }) => {
          if (swipeAlreadyReleased.current) return;

          swipeAlreadyReleased.current = true;

          const currentPosition = getTranslate(element);
          const dir = getSwipeDirection(swipeRequirementType === "velocity" ? speed : currentPosition) as Direction;

          if (dir !== "none") {
            if (onSwipe) onSwipe(dir);

            if (flickOnSwipe) {
              if (!preventSwipe.includes(dir)) {
                const outVelocity = swipeRequirementType === "velocity" ? speed : normalize(currentPosition, 600);
                await animateOut(element, outVelocity);
                element.style.display = "none";
                if (onCardLeftScreen) onCardLeftScreen(dir);
                return;
              }
            }
          }

          // Card was not flicked away, animate back to start
          void animateBack(element);
        },
        [flickOnSwipe, onSwipe, onCardLeftScreen, preventSwipe, swipeRequirementType]
      );

      const handleSwipeStart = useCallback(() => {
        swipeAlreadyReleased.current = false;
      }, []);

      useLayoutEffect(() => {
        if (!element.current) return;

        let offset = { x: 0, y: 0 };
        let speed = { x: 0, y: 0 };
        let lastLocation = { x: 0, y: 0, time: new Date().getTime() };
        let mouseIsClicked = false;

        const handleMove = (coordinates: { x: number; y: number }) => {
          if (!element.current) return;
          // Check fulfillment
          if (onSwipeRequirementFulfilled ?? onSwipeRequirementUnfulfilled) {
            const dir = getSwipeDirection(
              swipeRequirementType === "velocity" ? speed : getTranslate(element.current)
            ) as Direction;
            if (dir !== "none") {
              if (onSwipeRequirementFulfilled) onSwipeRequirementFulfilled(dir);
            } else {
              if (onSwipeRequirementUnfulfilled) onSwipeRequirementUnfulfilled();
            }
          }

          // Move
          const newLocation = dragableTouchmove(coordinates, element.current, offset, lastLocation);
          speed = calcSpeed(lastLocation, newLocation);
          lastLocation = newLocation;
        };

        const handleEnd = () => {
          if (!element.current) return;
          void handleSwipeReleased(element.current, speed);
        };

        const handleStart = (event: TouchEvent | MouseEvent, coordinates: { x: number; y: number }) => {
          const eventType = event.type;
          if (eventType === "mousedown") mouseIsClicked = true;
          handleSwipeStart();
          offset = {
            x: -coordinates.x,
            y: -coordinates.y,
          };
        };

        element.current.addEventListener("touchstart", (e: TouchEvent) => {
          handleStart(e, touchCoordinatesFromEvent(e));
        });

        element.current.addEventListener("mousedown", (e: MouseEvent) => {
          handleStart(e, mouseCoordinatesFromEvent(e));
        });

        element.current.addEventListener("touchmove", (e: TouchEvent) => {
          handleMove(touchCoordinatesFromEvent(e));
        });

        element.current.addEventListener("mousemove", (e: MouseEvent) => {
          if (mouseIsClicked) handleMove(mouseCoordinatesFromEvent(e));
        });

        element.current.addEventListener("touchend", handleEnd);

        element.current.addEventListener("mouseup", (e: MouseEvent) => {
          if (mouseIsClicked) {
            mouseIsClicked = false;
            handleEnd();
          }
        });

        element.current.addEventListener("mouseleave", (e: MouseEvent) => {
          if (mouseIsClicked) {
            mouseIsClicked = false;
            handleEnd();
          }
        });

        return () => {
          if (element.current) {
            element.current.removeEventListener("touchstart", handleStart as EventListener);
            element.current.removeEventListener("mousedown", handleStart as EventListener);
            element.current.removeEventListener("touchmove", handleMove as unknown as EventListener);
            element.current.removeEventListener("mousemove", handleMove as unknown as EventListener);
            element.current.removeEventListener("touchend", handleEnd);
            element.current.removeEventListener("mouseup", handleEnd);
            element.current.removeEventListener("mouseleave", handleEnd);
          }
        };
      }, [
        handleSwipeReleased,
        handleSwipeStart,
        onSwipeRequirementFulfilled,
        onSwipeRequirementUnfulfilled,
        swipeRequirementType,
      ]);

      return (
        <div ref={element} className={clsx("absolute z-20", className)}>
          {children}
        </div>
      );
    }
  )
);
