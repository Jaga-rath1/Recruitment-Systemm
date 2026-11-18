import React from 'react';
import { Outlet } from 'react-router-dom';
import MarketingNavbar from './MarketingNavbar';
import MarketingFooter from './MarketingFooter';

export default function MarketingLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-clip bg-slate-50 text-slate-900">
      <MarketingNavbar />
      <main className="w-full flex-1 bg-white">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}
