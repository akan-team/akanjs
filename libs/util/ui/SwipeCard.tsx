"use client";
import { cn } from "akanjs/client";
import type React from "react";
import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useRef } from "react";
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
  forwardRef<API, SwipeCardProps>((props, ref) => {
    const element = useRef<HTMLDivElement>(null);
    //? The listeners are bound once, so they read the props of the latest render from here.
    const latestProps = useRef(props);
    latestProps.current = props;

    useImperativeHandle(
      ref,
      () => ({
        async swipe(dir = "right") {
          const card = element.current;
          if (!card) return;
          latestProps.current.onSwipe?.(dir);
          const power = 1000;
          const disturbance = (Math.random() - 0.5) * 100;
          if (dir === "right") await animateOut(card, { x: power, y: disturbance }, true);
          else if (dir === "left") await animateOut(card, { x: -power, y: disturbance }, true);
          else if (dir === "up") await animateOut(card, { x: disturbance, y: power }, true);
          else if (dir === "down") await animateOut(card, { x: disturbance, y: -power }, true);
          card.style.display = "none";
          latestProps.current.onCardLeftScreen?.(dir);
        },
        async restoreCard() {
          const card = element.current;
          if (!card) return;
          card.style.display = "block";
          await animateBack(card);
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const card = element.current;
      if (!card) return;

      let offset = { x: 0, y: 0 };
      let speed = { x: 0, y: 0 };
      let lastLocation = { x: 0, y: 0, time: Date.now() };
      let isMouseDown = false;
      let isReleased = false;

      const directionOf = (property: { x: number; y: number }) =>
        getSwipeDirection(property, latestProps.current.swipeThreshold ?? settings.swipeThreshold) as Direction;

      const start = (coordinates: { x: number; y: number }) => {
        isReleased = false;
        offset = { x: -coordinates.x, y: -coordinates.y };
      };

      const move = (coordinates: { x: number; y: number }) => {
        const {
          onSwipeRequirementFulfilled,
          onSwipeRequirementUnfulfilled,
          swipeRequirementType = "velocity",
        } = latestProps.current;
        if (onSwipeRequirementFulfilled ?? onSwipeRequirementUnfulfilled) {
          const dir = directionOf(swipeRequirementType === "velocity" ? speed : getTranslate(card));
          if (dir !== "none") onSwipeRequirementFulfilled?.(dir);
          else onSwipeRequirementUnfulfilled?.();
        }
        const newLocation = dragableTouchmove(coordinates, card, offset, lastLocation);
        speed = calcSpeed(lastLocation, newLocation);
        lastLocation = newLocation;
      };

      const release = async () => {
        if (isReleased) return;
        isReleased = true;
        const {
          flickOnSwipe = true,
          onSwipe,
          onCardLeftScreen,
          preventSwipe = [],
          swipeRequirementType = "velocity",
        } = latestProps.current;
        const currentPosition = getTranslate(card);
        const dir = directionOf(swipeRequirementType === "velocity" ? speed : currentPosition);
        if (dir !== "none") {
          onSwipe?.(dir);
          if (flickOnSwipe && !preventSwipe.includes(dir)) {
            await animateOut(card, swipeRequirementType === "velocity" ? speed : normalize(currentPosition, 600));
            card.style.display = "none";
            onCardLeftScreen?.(dir);
            return;
          }
        }
        await animateBack(card);
      };

      const onTouchStart = (event: TouchEvent) => start(touchCoordinatesFromEvent(event));
      const onMouseDown = (event: MouseEvent) => {
        isMouseDown = true;
        start(mouseCoordinatesFromEvent(event));
      };
      const onTouchMove = (event: TouchEvent) => move(touchCoordinatesFromEvent(event));
      const onMouseMove = (event: MouseEvent) => {
        if (isMouseDown) move(mouseCoordinatesFromEvent(event));
      };
      const onTouchEnd = () => {
        void release();
      };
      const onMouseUp = () => {
        if (!isMouseDown) return;
        isMouseDown = false;
        void release();
      };

      card.addEventListener("touchstart", onTouchStart);
      card.addEventListener("mousedown", onMouseDown);
      card.addEventListener("touchmove", onTouchMove);
      card.addEventListener("mousemove", onMouseMove);
      card.addEventListener("touchend", onTouchEnd);
      card.addEventListener("mouseup", onMouseUp);
      card.addEventListener("mouseleave", onMouseUp);
      return () => {
        card.removeEventListener("touchstart", onTouchStart);
        card.removeEventListener("mousedown", onMouseDown);
        card.removeEventListener("touchmove", onTouchMove);
        card.removeEventListener("mousemove", onMouseMove);
        card.removeEventListener("touchend", onTouchEnd);
        card.removeEventListener("mouseup", onMouseUp);
        card.removeEventListener("mouseleave", onMouseUp);
      };
    }, []);

    return (
      <div ref={element} className={cn("absolute z-20", props.className)}>
        {props.children}
      </div>
    );
  }),
);
