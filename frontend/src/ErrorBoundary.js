import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary caught]", error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <h2>런타임 에러가 발생했습니다.</h2>
          <p style={{color:"#b91c1c"}}><b>{String(this.state.error)}</b></p>
          <pre style={{ whiteSpace: "pre-wrap", background:"#f7f7f7", padding:8, borderRadius:8, fontSize:12 }}>
            {String(this.state.info?.componentStack || "")}
          </pre>
          <p>브라우저를 Shift+F5로 새로고침하고도 계속되면 이 메시지를 복사해서 알려주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
