"use client";
import { clsx } from "akanjs/client";
import type React from "react";
import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type {
  API,
  CardLeftScreenHandler,
  Direction,
  SwipeHandler,
  SwipeRequirementFulfillUpdate,
  SwipeRequirementUnfulfillUpdate,
} from "./swipeCard.type";
import {
  animateBack,
  animateOut,
  calcSpeed,
  dragableTouchmove,
  getSwipeDirection,
  getTranslate,
  mouseCoordinatesFromEvent,
  normalize,
  settings,
  touchCoordinatesFromEvent,
} from "./swipeCard.util";

interface SwipeCardProps {
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

export const SwipeCard = memo(
  forwardRef<API, SwipeCardProps>(
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
      ref,
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
        [flickOnSwipe, onSwipe, onCardLeftScreen, preventSwipe, swipeRequirementType],
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
              swipeRequirementType === "velocity" ? speed : getTranslate(element.current),
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
    },
  ),
);
