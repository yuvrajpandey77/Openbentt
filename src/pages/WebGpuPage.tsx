import React from "react";
import { Navigate } from "react-router-dom";

/** Legacy route — on-device WebGPU chat was removed; send users to chat. */
const WebGpuPage: React.FC = () => <Navigate to="/chat" replace />;

export default WebGpuPage;