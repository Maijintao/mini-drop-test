module mini-drop/drop/test/grpc_client

go 1.25.0

replace mini-drop/apiserver => ../../../apiserver

require (
	google.golang.org/grpc v1.81.1
	mini-drop/apiserver v0.0.0-00010101000000-000000000000
)

require (
	golang.org/x/net v0.53.0 // indirect
	golang.org/x/sys v0.44.0 // indirect
	golang.org/x/text v0.37.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260226221140-a57be14db171 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
