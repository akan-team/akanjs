"use client";
import { st, User } from "@shared/client";

interface MyDiscordProps {
  className?: string;
  imageUrl?: string;
  joinUrl: string;
}
export const MyDiscord = ({ className, imageUrl, joinUrl }: MyDiscordProps) => {
  const self = st.use.self();
  return <User.View.Discord className={className} user={self} imageUrl={imageUrl} joinUrl={joinUrl} />;
};

export const Self = () => {
  const self = st.use.self();
  return <User.View.General user={self} />;
};
