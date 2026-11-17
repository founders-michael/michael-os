import MyDayFeature
import SwiftUI

struct RootView: View {
    var body: some View {
        #if DEBUG
            ComponentGallery()
        #else
            MyDayPlaceholder()
        #endif
    }
}
