
import React, { useEffect, useState } from "react";

export default function AppBackground() {
  const [mx, setMx] = useState(0);
  const [my, setMy] = useState(0);

  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMx(x);
      setMy(y);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-gradient-to-b from-white to-slate-50 dark:from-[#060713] dark:via-[#070b18] dark:to-[#030409]" />

      <div
        className="absolute top-[-140px] left-1/2 -translate-x-1/2 w-[760px] h-[320px] rounded-full blur-[140px]
                   bg-gradient-to-r from-emerald-500 via-indigo-500 to-fuchsia-500
                   opacity-15 dark:opacity-25"
        style={{ transform: `translate3d(${mx * 18}px, ${my * 12}px, 0) translateX(-50%)` }}
      />
      <div
        className="absolute bottom-[-220px] left-[-180px] w-[520px] h-[520px] rounded-full blur-[160px]
                   bg-emerald-500 opacity-10 dark:opacity-18"
        style={{ transform: `translate3d(${mx * 10}px, ${my * 8}px, 0)` }}
      />
      <div
        className="absolute bottom-[-240px] right-[-160px] w-[560px] h-[560px] rounded-full blur-[170px]
                   bg-indigo-600 opacity-10 dark:opacity-18"
        style={{ transform: `translate3d(${mx * -12}px, ${my * -9}px, 0)` }}
      />
    </div>
  );
}
