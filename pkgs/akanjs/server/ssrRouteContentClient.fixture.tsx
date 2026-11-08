"use client";

export const ReadsWindow = ({ label }: { label: string }) => <b>{`${window.location.pathname} ${label}`}</b>;
