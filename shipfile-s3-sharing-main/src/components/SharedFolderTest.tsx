import { useParams } from "react-router-dom";

export default function SharedFolderTest() {
  const { shareId } = useParams<{ shareId: string }>();
  
  console.log('SharedFolderTest loaded with shareId:', shareId);
  
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Shared Folder Test</h1>
      <p>ShareId: {shareId}</p>
      <p>If you see this, the route is working!</p>
    </div>
  );
}