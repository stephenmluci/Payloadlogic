import React from 'react';

export function AppFooter() {
  return (
    <footer className="bg-gray-800 text-gray-300 py-6 mt-12">
      <div className="container mx-auto text-center px-4 md:px-6">
        <p className="text-sm">&copy; {new Date().getFullYear()} Dash Dispatch Pro - Hotshot Trucking Management</p>
      </div>
    </footer>
  );
}
