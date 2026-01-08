import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "../layout/MainLayout";

import Dashboard from "./Dashboard";
import Resources from "./Resources";
import Booking from "./Booking";
import ResourceTypes from "./ResourceTypes";
import Availability from "./Availability";
import Rules from "./Rules";  
import ResourceRequests from "./ResourceRequests";
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="resources" element={<Resources />} />
          <Route path="bookings" element={<Booking />} />
          <Route path="resource-types" element={<ResourceTypes />} />
          <Route path="availability" element={<Availability />} />
          <Route path="rules" element={<Rules />} />  { }
          <Route path="requests" element={<ResourceRequests />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
